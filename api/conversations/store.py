"""
Conversation Storage — Supabase
================================
All queries are scoped to the authenticated user_id.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Optional

import anthropic

from api.config import MODEL
from api.db import get_db


def _generate_title(text: str) -> str:
    """Ask Claude for a 5-7 word summary title. Falls back to truncation on any error."""
    try:
        client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))
        response = client.messages.create(
            model=MODEL,
            max_tokens=20,
            messages=[{
                "role": "user",
                "content": (
                    "Write a short title for this question — 5 to 7 words, "
                    "sentence case, no punctuation at the end, no quotes. "
                    "Reply with only the title:\n\n" + text[:500]
                ),
            }],
        )
        return response.content[0].text.strip().strip('"').strip("'")
    except Exception:
        return text[:60] + ("…" if len(text) > 60 else "")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_conversation(room_id: str, config: dict, user_id: str) -> dict:
    db = get_db()
    result = (
        db.table("conversations")
        .insert({"room_id": room_id, "config": config, "title": "", "user_id": user_id})
        .execute()
    )
    return _attach_messages(result.data[0])


def get_conversation(conv_id: str, user_id: str) -> Optional[dict]:
    db = get_db()
    result = (
        db.table("conversations")
        .select("*")
        .eq("id", conv_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not result.data:
        return None
    return _attach_messages(result.data)


def list_conversations(user_id: str) -> list[dict]:
    db = get_db()
    result = (
        db.table("conversations")
        .select("id, title, room_id, created_at, updated_at")
        .eq("user_id", user_id)
        .order("updated_at", desc=True)
        .execute()
    )
    rows = result.data or []
    for row in rows:
        count_result = (
            db.table("messages")
            .select("id", count="exact")
            .eq("conversation_id", row["id"])
            .execute()
        )
        row["message_count"] = count_result.count or 0
    return rows


def update_conversation(conv_id: str, patch: dict, user_id: str) -> Optional[dict]:
    db = get_db()
    allowed = {k: v for k, v in patch.items() if k in ("title", "config")}
    if not allowed:
        return get_conversation(conv_id, user_id)
    result = (
        db.table("conversations")
        .update(allowed)
        .eq("id", conv_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        return None
    return _attach_messages(result.data[0])


def delete_conversation(conv_id: str, user_id: str) -> bool:
    db = get_db()
    # Check ownership first (Supabase DELETE returns empty data even on success)
    check = (
        db.table("conversations")
        .select("id")
        .eq("id", conv_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not check.data:
        return False
    # Delete messages first to avoid foreign-key constraint issues
    db.table("messages").delete().eq("conversation_id", conv_id).execute()
    db.table("conversations").delete().eq("id", conv_id).eq("user_id", user_id).execute()
    return True


def append_message(conv_id: str, message: dict, user_id: str) -> Optional[dict]:
    db = get_db()

    # Verify ownership before appending
    conv_result = (
        db.table("conversations")
        .select("title")
        .eq("id", conv_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not conv_result.data:
        return None

    db.table("messages").insert({
        "id": message.get("id"),
        "conversation_id": conv_id,
        "role": message["role"],
        "content": message["content"],
        "panel": message.get("panel", []),
        "timestamp": message.get("timestamp", _now()),
    }).execute()

    # Auto-title from first user message
    if not conv_result.data.get("title") and message["role"] == "user":
        title = _generate_title(message.get("content", ""))
        db.table("conversations").update({"title": title}).eq("id", conv_id).execute()

    return get_conversation(conv_id, user_id)


def _attach_messages(conv: dict) -> dict:
    db = get_db()
    result = (
        db.table("messages")
        .select("*")
        .eq("conversation_id", conv["id"])
        .order("timestamp")
        .execute()
    )
    conv["messages"] = result.data or []
    return conv
