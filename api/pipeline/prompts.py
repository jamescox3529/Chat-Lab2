"""
Prompt builders for the three-stage pipeline.
"""

from __future__ import annotations

from typing import Dict


def build_dispatcher_system(room_personas: Dict[str, str], project_context: str) -> str:
    panel_lines = "\n".join(f"- {pid}: {role}" for pid, role in room_personas.items())
    base = f"""\
You are a dispatcher for a railway engineering expert panel.

The panel consists of these specialists:
{panel_lines}

Read the user's message and conversation history. Decide which 1 to 4 panel \
members are genuinely relevant to this specific question.

Return ONLY a JSON array of persona IDs. Nothing else. No explanation. No markdown.

Examples:
["pm", "track_eng"]
["hs", "constr_eng", "possess_mgr"]
["sig_eng"]
"""
    if project_context:
        return f"{project_context}\n\n{base}"
    return base


def build_persona_system(
    role: str,
    knowledge_base: str,
    project_context: str,
    user_instruction: str,
) -> str:
    context_block = (
        f"\n\nPROJECT CONTEXT:\nYou have been provided with the following project "
        f"information. Use it to calibrate your advice — reference it where relevant, "
        f"but do not repeat it back verbatim:\n\n{project_context}"
        if project_context else ""
    )
    style_block = f"\n\n{user_instruction}" if user_instruction else ""

    return f"""\
You are a {role} with deep expertise in railway engineering.

YOUR KNOWLEDGE BASE:
{knowledge_base}
{context_block}{style_block}

You are part of a panel advising on a railway engineering question. Respond \
from your specialist perspective only. Be concise and practical — 2 to 4 short \
paragraphs. Focus on what matters most from your discipline. Do not add \
preamble like "As a {role}..." — just answer directly."""


def build_synthesiser_system(user_instruction: str) -> str:
    base = """\
You are synthesising advice from a panel of railway engineering specialists \
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
- Keep it focused. The user asked a question — answer it."""

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


def build_project_context(config: dict, documents: list[dict]) -> str:
    lines = []

    config_lines = []
    if config.get("infra_manager"):
        config_lines.append(f"Infrastructure Manager: {config['infra_manager']}")
    if config.get("infra_type"):
        config_lines.append(f"Infrastructure Type: {config['infra_type']}")
    if config.get("contract_type"):
        config_lines.append(f"Contract Type: {config['contract_type']}")
    if config.get("contract_option"):
        config_lines.append(f"Contract Option: {config['contract_option']}")
    if config.get("project_value"):
        config_lines.append(f"Project Value: {config['project_value']}")

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
