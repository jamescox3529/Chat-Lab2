"""
Pillar Loader
=============
Loads pillar definitions from knowledge/pillars.yaml.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

import yaml

PILLARS_FILE = Path(__file__).parent.parent.parent / "knowledge" / "pillars.yaml"

_cache: List["Pillar"] | None = None


@dataclass
class Pillar:
    id: str
    name: str
    description: str = ""


def load_pillars() -> List[Pillar]:
    global _cache
    if _cache is not None:
        return _cache

    try:
        data = yaml.safe_load(PILLARS_FILE.read_text(encoding="utf-8")) or []
        _cache = [Pillar(id=p["id"], name=p["name"], description=p.get("description", "")) for p in data]
    except Exception as exc:
        print(f"Warning: failed to load pillars.yaml: {exc}")
        _cache = []

    return _cache


def get_pillar(pillar_id: str) -> Optional[Pillar]:
    return next((p for p in load_pillars() if p.id == pillar_id), None)


def list_pillars() -> List[Dict]:
    return [{"id": p.id, "name": p.name, "description": p.description} for p in load_pillars()]
