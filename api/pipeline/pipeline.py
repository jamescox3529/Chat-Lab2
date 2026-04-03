"""
Three-Stage Pipeline
====================
Stage 1: Dispatcher   — selects 1-4 relevant persona IDs
Stage 2: Persona calls — each selected persona responds independently
Stage 3: Synthesiser  — combines responses, streams token-by-token via SSE

Yields server-sent event dicts:
  {"type": "status",  "content": "..."}
  {"type": "token",   "content": "..."}
  {"type": "done",    "panel": [...], "message_id": "..."}
"""

from __future__ import annotations

import json
import os
import uuid
from typing import AsyncIterator, Dict, List

import anthropic

from api.config import MODEL
from api.personas.loader import load_personas, Persona
from api.rooms.loader import get_room
from api.pipeline.prompts import (
    build_dispatcher_system,
    build_persona_system,
    build_synthesiser_system,
    build_synthesiser_user_message,
)


def _get_client() -> anthropic.Anthropic:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY environment variable not set")
    return anthropic.Anthropic(api_key=api_key)


def _history_to_messages(history: list[dict]) -> list[dict]:
    messages = []
    for turn in history:
        messages.append({"role": "user", "content": turn["content"] if turn.get("role") == "user" else turn.get("user", "")})
        if turn.get("role") == "user":
            pass
        else:
            messages.append({"role": "assistant", "content": turn.get("content", "")})
    return messages


def _build_api_history(messages: list[dict]) -> list[dict]:
    """Convert stored message list to alternating user/assistant pairs for Claude API."""
    api_messages = []
    for msg in messages:
        role = msg.get("role")
        content = msg.get("content", "")
        if role in ("user", "assistant"):
            api_messages.append({"role": role, "content": content})
    return api_messages


# ---------------------------------------------------------------------------
# Stage 1: Dispatcher
# ---------------------------------------------------------------------------

def _dispatch(
    client: anthropic.Anthropic,
    user_message: str,
    history: list[dict],
    room_personas: Dict[str, Persona],
    project_context: str,
    room_name: str = "",
) -> List[str]:
    fallback = next(iter(room_personas)) if room_personas else "pm"
    panel_map = {pid: p.role for pid, p in room_personas.items()}
    system = build_dispatcher_system(panel_map, project_context, room_name=room_name)

    api_history = _build_api_history(history)
    api_history.append({"role": "user", "content": user_message})

    response = client.messages.create(
        model=MODEL,
        max_tokens=64,
        system=system,
        messages=api_history,
    )

    raw = response.content[0].text.strip()
    try:
        ids = json.loads(raw)
        valid = [pid for pid in ids if pid in room_personas]
        return valid if valid else [fallback]
    except (json.JSONDecodeError, TypeError):
        return [fallback]


# ---------------------------------------------------------------------------
# Stage 2: Persona calls
# ---------------------------------------------------------------------------

def _call_persona(
    client: anthropic.Anthropic,
    persona: Persona,
    user_message: str,
    history: list[dict],
    project_context: str,
    user_instruction: str,
    room_name: str = "",
) -> str:
    system = build_persona_system(
        role=persona.role,
        knowledge_base=persona.knowledge_base,
        project_context=project_context,
        user_instruction=user_instruction,
        room_name=room_name,
    )

    api_history = _build_api_history(history)
    api_history.append({"role": "user", "content": user_message})

    response = client.messages.create(
        model=MODEL,
        max_tokens=512,
        system=system,
        messages=api_history,
    )

    return response.content[0].text.strip()


# ---------------------------------------------------------------------------
# Stage 3: Synthesiser (streaming)
# ---------------------------------------------------------------------------

async def _stream_synthesiser(
    client: anthropic.Anthropic,
    user_message: str,
    persona_responses: Dict[str, str],
    persona_roles: Dict[str, str],
    user_instruction: str,
    room_name: str = "",
) -> AsyncIterator[str]:
    system = build_synthesiser_system(user_instruction, room_name=room_name)
    user_content = build_synthesiser_user_message(
        user_message, persona_responses, persona_roles
    )

    with client.messages.stream(
        model=MODEL,
        max_tokens=1024,
        system=system,
        messages=[{"role": "user", "content": user_content}],
    ) as stream:
        for text in stream.text_stream:
            yield text


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

async def run_pipeline(
    room_id: str,
    user_message: str,
    history: list[dict],
    project_context: str,
    user_instruction: str,
) -> AsyncIterator[dict]:
    """
    Async generator that yields SSE event dicts:
      {"type": "status",  "content": "..."}
      {"type": "token",   "content": "..."}
      {"type": "done",    "panel": [...], "message_id": "..."}
    """
    room = get_room(room_id)
    if room is None:
        yield {"type": "error", "content": f"Room '{room_id}' not found"}
        return

    all_personas = load_personas()
    room_personas: Dict[str, Persona] = {
        pid: all_personas[pid] for pid in room.personas if pid in all_personas
    }

    client = _get_client()

    # Stage 1
    yield {"type": "status", "content": "Consulting panel..."}
    selected_ids = _dispatch(client, user_message, history, room_personas, project_context, room_name=room.name)

    # Stage 2
    persona_responses: Dict[str, str] = {}
    for pid in selected_ids:
        persona = room_personas[pid]
        yield {"type": "status", "content": f"Consulting {persona.role}..."}
        persona_responses[pid] = _call_persona(
            client, persona, user_message, history, project_context, user_instruction, room_name=room.name
        )

    # Stage 3
    yield {"type": "status", "content": "Synthesising response..."}
    persona_roles = {pid: room_personas[pid].role for pid in selected_ids}

    async for token in _stream_synthesiser(
        client, user_message, persona_responses, persona_roles, user_instruction, room_name=room.name
    ):
        yield {"type": "token", "content": token}

    message_id = str(uuid.uuid4())
    yield {"type": "done", "panel": selected_ids, "message_id": message_id}
