"""
Debate Storage — Supabase
==========================
All queries are scoped to the authenticated user_id.
"""

from __future__ import annotations

import os
import threading
from datetime import datetime, timezone
from typing import Optional

import anthropic

from api.config import FAST_MODEL
from api.db import get_db


def _generate_and_save_title(debate_id: str, question: str) -> None:
    """Generate a title for the debate with Claude. Runs in a background thread."""
    try:
        client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))
        response = client.messages.create(
            model=FAST_MODEL,
            max_tokens=20,
            messages=[{
                "role": "user",
                "content": (
                    "Write a short title for this debate question — 5 to 7 words, "
                    "sentence case, no punctuation at the end, no quotes. "
                    "Reply with only the title:\n\n" + question[:500]
                ),
            }],
        )
        title = response.content[0].text.strip().strip('"').strip("'")
    except Exception:
        title = question[:60] + ("…" if len(question) > 60 else "")
    try:
        get_db().table("debates").update({"title": title}).eq("id", debate_id).execute()
    except Exception:
        pass


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_debate(
    question: str,
    persona_ids: list[str],
    depth: str,
    document_ids: list[str],
    user_id: str,
    context: dict | None = None,
) -> dict:
    db = get_db()
    result = (
        db.table("debates")
        .insert({
            "question": question,
            "title": "",
            "depth": depth,
            "persona_ids": persona_ids,
            "document_ids": document_ids,
            "context": context or {},
            "user_id": user_id,
        })
        .execute()
    )
    row = result.data[0]

    # Generate title in background
    threading.Thread(
        target=_generate_and_save_title,
        args=(row["id"], question),
        daemon=True,
    ).start()

    return row


def get_debate(debate_id: str, user_id: str) -> Optional[dict]:
    db = get_db()
    result = (
        db.table("debates")
        .select("*")
        .eq("id", debate_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not result.data:
        return None
    return result.data


def save_debate_result(debate_id: str, result_text: str, user_id: str) -> None:
    db = get_db()
    db.table("debates").update({
        "result": result_text,
        "updated_at": _now(),
    }).eq("id", debate_id).eq("user_id", user_id).execute()


def list_debates(user_id: str) -> list[dict]:
    db = get_db()
    result = (
        db.table("debates")
        .select("id, title, question, depth, persona_ids, created_at, updated_at")
        .eq("user_id", user_id)
        .order("updated_at", desc=True)
        .execute()
    )
    return result.data or []


def delete_debate(debate_id: str, user_id: str) -> bool:
    db = get_db()
    # Check ownership first (Supabase DELETE returns empty data even on success)
    check = (
        db.table("debates")
        .select("id")
        .eq("id", debate_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not check.data:
        return False
    db.table("debates").delete().eq("id", debate_id).eq("user_id", user_id).execute()
    return True
