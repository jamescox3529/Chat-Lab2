"""
Document Storage — Supabase
============================
All queries are scoped to the authenticated user_id.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from api.db import get_db


def create_document(name: str, content: str, user_id: str) -> dict:
    db = get_db()
    result = (
        db.table("documents")
        .insert({
            "name": name,
            "content": content,
            "char_count": len(content),
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
            "user_id": user_id,
        })
        .execute()
    )
    return _without_content(result.data[0])


def get_document(doc_id: str, user_id: str) -> Optional[dict]:
    db = get_db()
    result = (
        db.table("documents")
        .select("*")
        .eq("id", doc_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    return result.data or None


def list_documents(doc_ids: list[str], user_id: str) -> list[dict]:
    if not doc_ids:
        return []
    db = get_db()
    result = (
        db.table("documents")
        .select("id, name, char_count, uploaded_at")
        .eq("user_id", user_id)
        .in_("id", doc_ids)
        .execute()
    )
    return result.data or []


def delete_document(doc_id: str, user_id: str) -> bool:
    db = get_db()
    result = (
        db.table("documents")
        .delete()
        .eq("id", doc_id)
        .eq("user_id", user_id)
        .execute()
    )
    return bool(result.data)


def _without_content(doc: dict) -> dict:
    return {k: v for k, v in doc.items() if k != "content"}
