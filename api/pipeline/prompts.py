"""
Prompt builders for the three-stage pipeline.
"""

from __future__ import annotations

import json
from typing import Dict


def build_dispatcher_system(room_personas: Dict[str, str], project_context: str, room_name: str = "") -> str:
    panel_lines = "\n".join(f"- {pid}: {role}" for pid, role in room_personas.items())
    panel_ids = list(room_personas.keys())
    example_ids = panel_ids[:3] if len(panel_ids) >= 3 else panel_ids
    panel_label = room_name if room_name else "expert panel"
    base = f"""\
You are a dispatcher for the {panel_label}.

The panel consists of these specialists:
{panel_lines}

Read the user's message and conversation history. Decide which 1 to 4 panel \
members are genuinely relevant to this specific question.

Return ONLY a JSON array of persona IDs. Nothing else. No explanation. No markdown.

Examples:
{json.dumps(example_ids[:2])}
{json.dumps(example_ids[:3])}
{json.dumps([example_ids[0]])}
"""
    if project_context:
        return f"{project_context}\n\n{base}"
    return base


def build_persona_system(
    role: str,
    knowledge_base: str,
    project_context: str,
    user_instruction: str,
    room_name: str = "",
) -> str:
    context_block = (
        f"\n\nPROJECT CONTEXT:\nYou have been provided with the following project "
        f"information. Use it to calibrate your advice — reference it where relevant, "
        f"but do not repeat it back verbatim:\n\n{project_context}"
        if project_context else ""
    )
    style_block = f"\n\n{user_instruction}" if user_instruction else ""
    panel_label = room_name if room_name else "expert panel"

    return f"""\
You are a {role}.

YOUR KNOWLEDGE BASE:
{knowledge_base}
{context_block}{style_block}

You are part of the {panel_label}. Respond \
from your specialist perspective only. Be concise and practical — 2 to 4 short \
paragraphs. Focus on what matters most from your discipline. Do not add \
preamble like "As a {role}..." — just answer directly.

EPISTEMIC DISCIPLINE:
- If you are uncertain about a specific fact, figure, standard, or clause reference, say so explicitly rather than stating it with false confidence.
- Do not invent or approximate standard numbers, regulation names, clause references, or statistics. If you know something exists but cannot recall the exact detail, name it and flag that the user should verify the precise reference.
- If a question falls outside your area of expertise, say so directly and indicate which discipline is better placed to answer.
- Do not fill gaps in your knowledge with plausible-sounding detail. A clear "I don't have enough information to advise on this with confidence" is more valuable than a confident but unreliable answer.

JURISDICTION AWARENESS:
- Where the project context specifies a location or region, prioritise the standards, regulations, and legal frameworks applicable to that jurisdiction. Reference them by name.
- Where no location is specified, state which jurisdiction your advice assumes, so the user can judge its applicability.
- Do not default silently to one jurisdiction's standards when others may apply — surface the difference if it matters."""


def build_synthesiser_system(user_instruction: str, room_name: str = "") -> str:
    panel_label = room_name if room_name else "expert panel"
    base = f"""\
You are synthesising advice from the {panel_label} \
into a single, clear response for the user.

Your job:
- Integrate the perspectives into a coherent answer
- Actively look for genuine disagreement between specialists. If you find it, \
  surface it explicitly — explain the tension, do not average it away
- If specialists broadly agree, say so directly and confidently
- Highlight any critical caveats or safety considerations
- Write in plain, professional English — no bullet-point soup unless it \
  genuinely helps clarity
- Do not attribute every point to a specific specialist; synthesise, don't list
- Keep it focused. The user asked a question — answer it.
- Synthesise only from what the panel has provided. Do not introduce facts, figures, standards, or recommendations not present in their responses.
- Where panel members have expressed uncertainty or flagged the limits of their knowledge, preserve that in your synthesis — do not smooth over it with confident language.
- Where jurisdiction-specific advice has been given, make the applicable jurisdiction clear to the user."""

    if user_instruction:
        return (
            f"{base}\n\nAdditionally, apply these response style instructions "
            f"to your output:\n{user_instruction}"
        )
    return base


def build_synthesiser_user_message(
    user_message: str,
    persona_responses: Dict[str, str],
    persona_roles: Dict[str, str],
) -> str:
    panel_input = "\n\n".join(
        f"--- {persona_roles.get(pid, pid)} ---\n{response}"
        for pid, response in persona_responses.items()
    )
    return f"""\
ORIGINAL QUESTION:
{user_message}

PANEL RESPONSES:
{panel_input}

Please synthesise these into a single response for the user."""


def build_project_context(
    config: dict,
    documents: list[dict],
    field_labels: dict[str, str] | None = None,
) -> str:
    lines = []

    config_lines = []
    for key, value in config.items():
        if value:
            label = field_labels.get(key, key) if field_labels else key
            config_lines.append(f"{label}: {value}")

    if config_lines:
        lines.append("PROJECT CONTEXT:")
        lines.extend(config_lines)

    if documents:
        from api.documents.extract import DOC_CHAR_LIMIT, TOTAL_DOC_CHAR_LIMIT
        total_chars = 0
        doc_lines = []
        for doc in documents:
            remaining = TOTAL_DOC_CHAR_LIMIT - total_chars
            if remaining <= 0:
                break
            content = doc["content"][:min(DOC_CHAR_LIMIT, remaining)]
            total_chars += len(content)
            truncated = (
                len(doc["content"]) > DOC_CHAR_LIMIT
                or total_chars >= TOTAL_DOC_CHAR_LIMIT
            )
            suffix = "\n[... document truncated ...]" if truncated else ""
            doc_lines.append(f"\n[Document: {doc['name']}]\n{content}{suffix}")
        if doc_lines:
            lines.append("\nUPLOADED PROJECT DOCUMENTS:")
            lines.extend(doc_lines)

    return "\n".join(lines)


def build_user_profile_instruction(profile: dict) -> str:
    parts = []

    exp = profile.get("experience")
    task = profile.get("task")
    uncertainty = profile.get("uncertainty")
    use = profile.get("use")

    if exp:
        parts.append(f"The person you are responding to {exp}")
    if task:
        parts.append(task)
    if uncertainty:
        parts.append(uncertainty)
    if use:
        parts.append(use)

    if not parts:
        return ""

    return "RESPONSE STYLE:\n" + "\n\n".join(parts)
