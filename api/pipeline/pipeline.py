"""
Three-Stage Pipeline
====================
Stage 0: Planner      — decomposes questions, assigns personas per question (Haiku)
Stage 1: Persona calls — each persona answers their assigned questions in parallel (Sonnet)
Stage 2: Synthesiser  — combines structured responses, streams token-by-token (Sonnet or Opus)

Complexity tiers (detected from message + user profile):
  low      → short single question, conversational use
  standard → moderate depth, single clear question
  high     → multi-question, long problem statement, decision/document output

Yields server-sent event dicts:
  {"type": "status",  "content": "..."}
  {"type": "token",   "content": "..."}
  {"type": "done",    "panel": [...], "message_id": "..."}
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import uuid
from dataclasses import dataclass, field
from typing import AsyncIterator, Dict, List

import anthropic

from api.config import MODEL, FAST_MODEL, POWER_MODEL, TOKEN_BUDGETS
from api.personas.loader import load_personas, Persona
from api.rooms.loader import get_room
from api.pipeline.prompts import (
    build_planner_system,
    build_persona_system,
    build_synthesiser_system,
    build_synthesiser_user_message,
)


@dataclass
class PlannedQuestion:
    id: str
    summary: str
    personas: List[str]


def _get_client() -> anthropic.Anthropic:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY environment variable not set")
    return anthropic.Anthropic(api_key=api_key)


def _build_api_history(messages: list[dict]) -> list[dict]:
    """Convert stored message list to alternating user/assistant pairs for Claude API.

    Skips messages with empty content — these can occur if a previous pipeline
    run failed before synthesis and saved an empty assistant turn. Including them
    causes the Anthropic API to reject the request with a 400 error, breaking all
    subsequent turns in the conversation.
    """
    api_messages = []
    for msg in messages:
        role = msg.get("role")
        content = msg.get("content", "").strip()
        if role in ("user", "assistant") and content:
            api_messages.append({"role": role, "content": content})
    return api_messages


# ---------------------------------------------------------------------------
# Complexity detection (no AI call — pure heuristics)
# ---------------------------------------------------------------------------

def _detect_complexity(user_message: str, user_profile: dict) -> str:
    """
    Returns 'low', 'standard', or 'high'.
    Reads message signals (length, question count) and profile selections (task, use).
    """
    score = 0

    word_count = len(user_message.split())
    if word_count > 200:
        score += 2
    elif word_count > 80:
        score += 1

    # Numbered or labelled questions
    markers = re.findall(
        r'(?:^|\n)\s*(?:question\s+\d+|q\d+|\d+[.)]\s+|[a-z][.)]\s+)',
        user_message,
        re.IGNORECASE | re.MULTILINE,
    )
    if len(markers) >= 3:
        score += 2
    elif len(markers) >= 2:
        score += 1

    if user_message.count("?") >= 3:
        score += 1

    task = user_profile.get("task", "")
    use = user_profile.get("use", "")

    if "Produce something" in task or "Write something up" in use:
        score += 2
    elif "Make a decision" in task or "Brief someone" in use:
        score += 1
    elif "Have a conversation" in use or "Understand something" in task:
        score -= 1

    if score >= 4:
        return "high"
    if score >= 2:
        return "standard"
    return "low"


# ---------------------------------------------------------------------------
# Stage 0: Planner
# ---------------------------------------------------------------------------

def _plan(
    client: anthropic.Anthropic,
    user_message: str,
    history: list[dict],
    room_personas: Dict[str, Persona],
    project_context: str,
    room_name: str = "",
    routing_triggers: str = "",
) -> List[PlannedQuestion]:
    """
    Returns a list of PlannedQuestion — one per distinct question in the message,
    each with its own persona assignment.
    Falls back to a single question covering all personas if parsing fails.
    """
    panel_map = {pid: p.role for pid, p in room_personas.items()}
    system = build_planner_system(panel_map, project_context, room_name=room_name, routing_triggers=routing_triggers)

    api_history = _build_api_history(history)
    api_history.append({"role": "user", "content": user_message})

    response = client.messages.create(
        model=FAST_MODEL,
        max_tokens=512,
        system=system,
        messages=api_history,
    )

    raw = response.content[0].text.strip()
    try:
        data = json.loads(raw)
        questions: List[PlannedQuestion] = []
        for q in data.get("questions", []):
            valid_personas = [p for p in q.get("personas", []) if p in room_personas]
            if not valid_personas:
                valid_personas = [next(iter(room_personas))]
            questions.append(PlannedQuestion(
                id=q.get("id", f"q{len(questions) + 1}"),
                summary=q.get("summary", ""),
                personas=valid_personas,
            ))
        if questions:
            return questions
    except (json.JSONDecodeError, TypeError, KeyError):
        pass

    # Fallback: single question, all room personas up to 4
    return [PlannedQuestion(
        id="q1",
        summary=user_message[:120],
        personas=list(room_personas.keys())[:6],
    )]


# ---------------------------------------------------------------------------
# Stage 1: Persona calls
# ---------------------------------------------------------------------------

def _call_persona(
    client: anthropic.Anthropic,
    persona: Persona,
    user_message: str,
    history: list[dict],
    project_context: str,
    user_instruction: str,
    room_name: str = "",
    assigned_questions: List[PlannedQuestion] | None = None,
    complexity: str = "standard",
    token_budget: int = 900,
) -> str:
    system = build_persona_system(
        role=persona.role,
        knowledge_base=persona.knowledge_base,
        project_context=project_context,
        user_instruction=user_instruction,
        room_name=room_name,
        assigned_questions=[{"id": q.id, "summary": q.summary} for q in (assigned_questions or [])],
        complexity=complexity,
    )

    api_history = _build_api_history(history)
    api_history.append({"role": "user", "content": user_message})

    response = client.messages.create(
        model=MODEL,
        max_tokens=token_budget,
        system=system,
        messages=api_history,
    )

    return response.content[0].text.strip()


# ---------------------------------------------------------------------------
# Stage 2: Synthesiser (streaming)
# ---------------------------------------------------------------------------

async def _stream_synthesiser(
    client: anthropic.Anthropic,
    user_message: str,
    questions: List[PlannedQuestion],
    persona_responses: Dict[str, Dict[str, str]],
    persona_roles: Dict[str, str],
    user_instruction: str,
    room_name: str = "",
    token_budget: int = 2500,
    model: str = MODEL,
) -> AsyncIterator[str]:
    system = build_synthesiser_system(
        user_instruction,
        room_name=room_name,
        multi_question=len(questions) > 1,
    )
    user_content = build_synthesiser_user_message(
        user_message,
        [{"id": q.id, "summary": q.summary} for q in questions],
        persona_responses,
        persona_roles,
    )

    with client.messages.stream(
        model=model,
        max_tokens=token_budget,
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
    user_profile: dict | None = None,
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

    try:
        # Detect complexity and select budgets/model
        complexity = _detect_complexity(user_message, user_profile or {})
        budgets = TOKEN_BUDGETS[complexity]
        synth_model = POWER_MODEL if complexity == "high" else MODEL

        # Stage 0: Plan — decompose questions and assign personas
        yield {"type": "status", "content": "Analysing your question..."}
        questions = _plan(client, user_message, history, room_personas, project_context, room_name=room.name, routing_triggers=room.routing_triggers)
        yield {
            "type": "plan",
            "questions": [
                {"id": q.id, "summary": q.summary, "personas": q.personas}
                for q in questions
            ],
        }

        # Build persona → assigned questions map (deduplicated)
        persona_question_map: Dict[str, List[PlannedQuestion]] = {}
        for question in questions:
            for pid in question.personas:
                persona_question_map.setdefault(pid, []).append(question)

        # Stage 1: Persona calls (parallel, with keep-alive pings)
        roles_label = ", ".join(
            room_personas[pid].role
            for pid in persona_question_map
            if pid in room_personas
        )
        yield {"type": "status", "content": f"Consulting {roles_label}..."}

        loop = asyncio.get_running_loop()

        async def _call_async(pid: str, assigned_qs: List[PlannedQuestion]) -> tuple[str, List[str], str]:
            persona = room_personas[pid]
            response = await loop.run_in_executor(
                None, _call_persona,
                client, persona, user_message, history, project_context,
                user_instruction, room.name, assigned_qs, complexity, budgets["persona"],
            )
            return pid, [q.id for q in assigned_qs], response

        # Run persona calls as tasks so we can yield keep-alive events while waiting.
        # Without this, the generator goes silent for potentially 30-60s and the
        # connection is dropped by Vercel/Fastly before any response appears.
        tasks = [
            asyncio.ensure_future(_call_async(pid, assigned_qs))
            for pid, assigned_qs in persona_question_map.items()
            if pid in room_personas
        ]
        pending = set(tasks)
        while pending:
            done, pending = await asyncio.wait(pending, timeout=8.0)
            if pending:
                yield {"type": "status", "content": f"Consulting {roles_label}..."}
        results = [t.result() for t in tasks]

        # Build structured responses: question_id → persona_id → response
        structured_responses: Dict[str, Dict[str, str]] = {}
        for pid, q_ids, response in results:
            for q_id in q_ids:
                structured_responses.setdefault(q_id, {})[pid] = response

        # Emit individual persona responses for eval instrumentation
        for pid, q_ids, response in results:
            if pid in room_personas:
                yield {
                    "type": "persona",
                    "persona_id": pid,
                    "role": room_personas[pid].role,
                    "response": response,
                }

        # Stage 2: Synthesise
        yield {"type": "status", "content": "Synthesising response..."}
        persona_roles = {
            pid: room_personas[pid].role
            for pid in persona_question_map
            if pid in room_personas
        }

        async for token in _stream_synthesiser(
            client, user_message, questions, structured_responses,
            persona_roles, user_instruction, room_name=room.name,
            token_budget=budgets["synthesiser"], model=synth_model,
        ):
            yield {"type": "token", "content": token}

        message_id = str(uuid.uuid4())
        yield {"type": "done", "panel": list(persona_question_map.keys()), "message_id": message_id}

    except Exception as exc:
        print(f"[pipeline] ERROR conv={room_id}: {type(exc).__name__}: {exc}", file=sys.stderr, flush=True)
        yield {"type": "error", "content": f"Pipeline error: {exc}"}
