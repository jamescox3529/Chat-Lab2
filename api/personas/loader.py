"""
Persona Loader
==============
Loads persona definitions from YAML files in knowledge/personas/.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

import yaml

PERSONAS_DIR = Path(__file__).parent.parent.parent / "knowledge" / "personas"

_cache: Dict[str, "Persona"] | None = None


@dataclass
class Persona:
    id: str
    role: str
    question_types: List[str]
    knowledge_base: str


def load_personas() -> Dict[str, Persona]:
    global _cache
    if _cache is not None:
        return _cache

    personas: Dict[str, Persona] = {}
    for yaml_file in PERSONAS_DIR.glob("*.yaml"):
        try:
            data = yaml.safe_load(yaml_file.read_text(encoding="utf-8"))
            persona = Persona(
                id=data["id"],
                role=data["role"],
                question_types=data.get("question_types", []),
                knowledge_base=data.get("knowledge_base", "").strip(),
            )
            personas[persona.id] = persona
        except Exception as exc:
            print(f"Warning: failed to load {yaml_file.name}: {exc}")

    _cache = personas
    return _cache


def get_persona(persona_id: str) -> Optional[Persona]:
    return load_personas().get(persona_id)


def list_personas() -> List[Dict[str, str]]:
    return [{"id": p.id, "role": p.role} for p in load_personas().values()]
