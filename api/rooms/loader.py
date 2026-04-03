"""
Room Loader
===========
Loads room definitions from YAML files in knowledge/rooms/.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

import yaml

ROOMS_DIR = Path(__file__).parent.parent.parent / "knowledge" / "rooms"

_cache: Dict[str, "Room"] | None = None


@dataclass
class ProjectContextField:
    key: str
    label: str
    options: List[str]


@dataclass
class Room:
    id: str
    name: str
    description: str
    personas: List[str]
    project_context: List[ProjectContextField] = field(default_factory=list)


def load_rooms() -> Dict[str, Room]:
    global _cache
    if _cache is not None:
        return _cache

    rooms: Dict[str, Room] = {}
    for yaml_file in ROOMS_DIR.glob("*.yaml"):
        try:
            data = yaml.safe_load(yaml_file.read_text(encoding="utf-8"))
            raw_fields = data.get("project_context", [])
            context_fields = [
                ProjectContextField(
                    key=f["key"],
                    label=f["label"],
                    options=f.get("options", []),
                )
                for f in raw_fields
            ]
            room = Room(
                id=data["id"],
                name=data["name"],
                description=data.get("description", ""),
                personas=data.get("personas", []),
                project_context=context_fields,
            )
            rooms[room.id] = room
        except Exception as exc:
            print(f"Warning: failed to load {yaml_file.name}: {exc}")

    _cache = rooms
    return _cache


def get_room(room_id: str) -> Optional[Room]:
    return load_rooms().get(room_id)


def list_rooms() -> List[Dict]:
    return [
        {"id": r.id, "name": r.name, "description": r.description}
        for r in load_rooms().values()
    ]
