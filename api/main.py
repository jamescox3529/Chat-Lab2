"""
Chat-Lab2 — FastAPI Backend
============================
All API routes. Run with:
  uvicorn api.main:app --reload --port 8000
"""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from api.auth import get_current_user_id
from api.config import (
    EXPERIENCE_OPTIONS,
    TASK_OPTIONS,
    UNCERTAINTY_OPTIONS,
    USE_OPTIONS,
)
from api.personas.loader import list_personas, get_persona
from api.pillars.loader import list_pillars, get_pillar
from api.rooms.loader import load_rooms, list_rooms, get_room
from api.conversations.store import (
    create_conversation,
    get_conversation,
    list_conversations,
    update_conversation,
    delete_conversation,
    append_message,
)
from api.documents.store import create_document, get_document, list_documents, delete_document
from api.documents.extract import extract_text
from api.pipeline.pipeline import run_pipeline
from api.pipeline.prompts import build_project_context, build_user_profile_instruction
from api.debate.engine import run_debate
from api.debate.store import (
    create_debate,
    get_debate,
    save_debate_result,
    list_debates,
    delete_debate as delete_debate_record,
)

app = FastAPI(title="Chat-Lab2 API", version="1.0.0")

# ALLOWED_ORIGINS is a comma-separated list set in production env vars.
# Falls back to "*" for local development when the var is absent.
_raw_origins = os.environ.get("ALLOWED_ORIGINS", "")
_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()] or ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# Health
# =============================================================================

@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/health/db")
def health_db():
    """Diagnostic: test Supabase connection and return any error."""
    try:
        from api.db import get_db
        db = get_db()
        result = db.table("conversations").select("id").limit(1).execute()
        return {"status": "ok", "supabase": "connected", "rows": len(result.data or [])}
    except Exception as exc:
        return {"status": "error", "detail": str(exc), "type": type(exc).__name__}


# =============================================================================
# Config options (for frontend dropdowns)
# =============================================================================

@app.get("/api/config/options")
def config_options(room_id: str = ""):
    room = get_room(room_id) if room_id else None
    project_fields = [
        {"key": f.key, "label": f.label, "options": f.options}
        for f in room.project_context
    ] if room else []
    return {
        "experience": [{"label": label, "value": label} for label, _ in EXPERIENCE_OPTIONS],
        "task": [{"label": label, "value": label} for label, _ in TASK_OPTIONS],
        "uncertainty": [{"label": label, "value": label} for label, _ in UNCERTAINTY_OPTIONS],
        "use": [{"label": label, "value": label} for label, _ in USE_OPTIONS],
        "project_fields": project_fields,
    }


# =============================================================================
# Pillars
# =============================================================================

@app.get("/api/pillars")
def get_pillars():
    return list_pillars()


@app.get("/api/pillars/{pillar_id}")
def get_pillar_detail(pillar_id: str):
    pillar = get_pillar(pillar_id)
    if pillar is None:
        raise HTTPException(status_code=404, detail="Pillar not found")
    rooms = [r for r in load_rooms().values() if r.pillar == pillar_id]
    return {
        "id": pillar.id,
        "name": pillar.name,
        "rooms": [
            {
                "id": r.id,
                "name": r.name,
                "description": r.description,
                "persona_count": len(r.personas),
            }
            for r in rooms
        ],
    }


# =============================================================================
# Rooms
# =============================================================================

@app.get("/api/rooms")
def get_rooms():
    return [
        {
            "id": r.id,
            "name": r.name,
            "description": r.description,
            "pillar": r.pillar,
            "persona_count": len(r.personas),
        }
        for r in load_rooms().values()
    ]


@app.get("/api/rooms/{room_id}")
def get_room_detail(room_id: str):
    room = get_room(room_id)
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    return {
        "id": room.id,
        "name": room.name,
        "description": room.description,
        "pillar": room.pillar,
        "persona_count": len(room.personas),
        "personas": [
            {"id": pid, "role": p.role}
            for pid in room.personas
            if (p := get_persona(pid)) is not None
        ],
    }


# =============================================================================
# Conversations
# =============================================================================

class ConversationCreate(BaseModel):
    room_id: str
    config: dict = {}


class ConversationPatch(BaseModel):
    title: Optional[str] = None
    config: Optional[dict] = None


@app.post("/api/conversations", status_code=201)
def create_conv(
    body: ConversationCreate,
    user_id: str = Depends(get_current_user_id),
):
    return create_conversation(room_id=body.room_id, config=body.config, user_id=user_id)


@app.get("/api/conversations")
def list_convs(room_id: str = "", user_id: str = Depends(get_current_user_id)):
    convs = list_conversations(user_id=user_id)
    if room_id:
        convs = [c for c in convs if c.get("room_id") == room_id]
    # Enrich with room name (rooms are in-memory from YAML, no extra DB query)
    for c in convs:
        room = get_room(c.get("room_id", ""))
        c["room_name"] = room.name if room else ""
    return convs


@app.get("/api/conversations/{conv_id}")
def get_conv(conv_id: str, user_id: str = Depends(get_current_user_id)):
    conv = get_conversation(conv_id, user_id=user_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


@app.patch("/api/conversations/{conv_id}")
def patch_conv(
    conv_id: str,
    body: ConversationPatch,
    user_id: str = Depends(get_current_user_id),
):
    patch = {}
    if body.title is not None:
        patch["title"] = body.title
    if body.config is not None:
        patch["config"] = body.config
    result = update_conversation(conv_id, patch, user_id=user_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return result


@app.delete("/api/conversations/{conv_id}", status_code=204)
def delete_conv(conv_id: str, user_id: str = Depends(get_current_user_id)):
    if not delete_conversation(conv_id, user_id=user_id):
        raise HTTPException(status_code=404, detail="Conversation not found")


# =============================================================================
# Chat (SSE streaming)
# =============================================================================

class ChatRequest(BaseModel):
    message: str


@app.post("/api/conversations/{conv_id}/chat")
async def chat(
    conv_id: str,
    body: ChatRequest,
    user_id: str = Depends(get_current_user_id),
):
    conv = get_conversation(conv_id, user_id=user_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    config = conv.get("config", {})
    user_profile = config.get("user_profile", {})
    project_config = config.get("project_config", {})
    document_ids = config.get("document_ids", [])

    # Resolve documents (scoped to same user)
    documents = []
    for doc_id in document_ids:
        doc = get_document(doc_id, user_id=user_id)
        if doc:
            documents.append(doc)

    room = get_room(conv.get("room_id", ""))
    field_labels = {f.key: f.label for f in room.project_context} if room else {}
    project_context = build_project_context(project_config, documents, field_labels)
    user_instruction = build_user_profile_instruction(user_profile)

    history = conv.get("messages", [])
    user_message = body.message

    # Save user message immediately
    user_msg = {
        "id": str(uuid.uuid4()),
        "role": "user",
        "content": user_message,
        "panel": [],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    append_message(conv_id, user_msg, user_id=user_id)

    async def event_stream():
        full_response = []
        panel_ids = []
        message_id = None

        async for event in run_pipeline(
            room_id=conv["room_id"],
            user_message=user_message,
            history=history,
            project_context=project_context,
            user_instruction=user_instruction,
        ):
            if event["type"] == "token":
                full_response.append(event["content"])
            elif event["type"] == "done":
                panel_ids = event.get("panel", [])
                message_id = event.get("message_id")

            yield f"data: {json.dumps(event)}\n\n"

            # Keep-alive comment to prevent proxy/CDN timeouts (e.g. Fastly 60s)
            yield ": ping\n\n"

        # Save assistant message
        assistant_msg = {
            "id": message_id or str(uuid.uuid4()),
            "role": "assistant",
            "content": "".join(full_response),
            "panel": panel_ids,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        append_message(conv_id, assistant_msg, user_id=user_id)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# =============================================================================
# Documents
# =============================================================================

@app.get("/api/documents")
def fetch_documents(ids: str = "", user_id: str = Depends(get_current_user_id)):
    """Return document metadata (no content) for a comma-separated list of IDs."""
    id_list = [i.strip() for i in ids.split(",") if i.strip()]
    return list_documents(id_list, user_id=user_id)


@app.post("/api/documents", status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
):
    allowed = {".pdf", ".docx", ".xlsx", ".xls"}
    suffix = "." + file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if suffix not in allowed:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {suffix}")

    file_bytes = await file.read()
    content = extract_text(file.filename, file_bytes)
    doc = create_document(name=file.filename, content=content, user_id=user_id)
    return doc


@app.delete("/api/documents/{doc_id}", status_code=204)
def remove_document(doc_id: str, user_id: str = Depends(get_current_user_id)):
    if not delete_document(doc_id, user_id=user_id):
        raise HTTPException(status_code=404, detail="Document not found")


# =============================================================================
# Personas (all rooms, for debate picker)
# =============================================================================

@app.get("/api/personas")
def get_all_personas():
    """Return all personas from all rooms, deduplicated, with expertise and pillar grouping."""
    from api.personas.loader import load_personas as _load
    from api.rooms.loader import load_rooms as _load_rooms

    pillar_names = {
        "infrastructure_engineering": "Infrastructure & Engineering",
        "strategy_advisory": "Strategy & Advisory",
        "people_organisation": "People & Organisation",
        "digital_technology": "Digital & Technology",
    }

    # Build persona -> (room_name, pillar_id) from rooms
    rooms = _load_rooms()
    persona_pillar: dict[str, str] = {}
    persona_room: dict[str, str] = {}
    for room in rooms.values():
        for pid in room.personas:
            persona_pillar[pid] = room.pillar
            persona_room[pid] = room.name

    all_personas = _load()
    result = []
    for pid, persona in all_personas.items():
        # Extract first sentence of EXPERTISE block
        kb = persona.knowledge_base
        expertise = ""
        if "EXPERTISE:" in kb:
            after = kb.split("EXPERTISE:", 1)[1].strip()
            for char in after:
                if char in (".", "\n"):
                    break
                expertise += char
            expertise = expertise.strip()
        if not expertise:
            expertise = persona.role

        pillar_id = persona_pillar.get(pid, "")
        result.append({
            "id": pid,
            "role": persona.role,
            "expertise": expertise,
            "pillar": pillar_id,
            "pillar_name": pillar_names.get(pillar_id, "Other"),
            "room_name": persona_room.get(pid, ""),
        })

    result.sort(key=lambda x: (x["pillar_name"], x["role"]))
    return result


# =============================================================================
# Debates
# =============================================================================

class DebateCreate(BaseModel):
    question: str
    persona_ids: list[str]
    depth: str = "standard"
    document_ids: list[str] = []


@app.post("/api/debates", status_code=201)
def create_debate_route(
    body: DebateCreate,
    user_id: str = Depends(get_current_user_id),
):
    return create_debate(
        question=body.question,
        persona_ids=body.persona_ids,
        depth=body.depth,
        document_ids=body.document_ids,
        user_id=user_id,
    )


@app.get("/api/debates")
def list_debates_route(user_id: str = Depends(get_current_user_id)):
    return list_debates(user_id=user_id)


@app.get("/api/debates/{debate_id}")
def get_debate_route(debate_id: str, user_id: str = Depends(get_current_user_id)):
    debate = get_debate(debate_id, user_id=user_id)
    if debate is None:
        raise HTTPException(status_code=404, detail="Debate not found")
    return debate


@app.delete("/api/debates/{debate_id}", status_code=204)
def delete_debate_route(debate_id: str, user_id: str = Depends(get_current_user_id)):
    if not delete_debate_record(debate_id, user_id=user_id):
        raise HTTPException(status_code=404, detail="Debate not found")


@app.get("/api/debates/{debate_id}/stream")
async def stream_debate_route(
    debate_id: str,
    user_id: str = Depends(get_current_user_id),
):
    debate = get_debate(debate_id, user_id=user_id)
    if debate is None:
        raise HTTPException(status_code=404, detail="Debate not found")

    document_ids = debate.get("document_ids", [])

    # Resolve documents (scoped to same user)
    documents = []
    for doc_id in document_ids:
        doc = get_document(doc_id, user_id=user_id)
        if doc:
            documents.append(doc)

    project_context = build_project_context(config={}, documents=documents)

    async def event_stream():
        full_response = []

        async for event in run_debate(
            debate_id=debate_id,
            question=debate["question"],
            persona_ids=debate.get("persona_ids", []),
            depth=debate.get("depth", "standard"),
            project_context=project_context,
        ):
            if event["type"] == "token":
                full_response.append(event["content"])
            elif event["type"] == "done":
                # Save result before yielding done
                if full_response:
                    save_debate_result(debate_id, "".join(full_response), user_id)

            yield f"data: {json.dumps(event)}\n\n"
            yield ": ping\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
