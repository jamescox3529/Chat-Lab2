"""
Document Synthesiser
====================
Calls Claude with the full conversation transcript and returns structured
markdown for the report body. This is a dedicated AI call — it does not
route through the Dispatcher → Personas → Synthesiser pipeline.
"""
from __future__ import annotations

import os
from anthropic import Anthropic

_SYSTEM_PROMPT = """\
You are a professional report writer for Roundtable, an AI-powered expert panel platform.

You have been given the full transcript of a consultation session between a user and a specialist panel. Your task is to produce a structured, professional report that a consultant could present to a client or stakeholder.

This report must demonstrate that it was produced from this specific conversation. Any report that could have been written without reading the transcript has failed its purpose. Where the conversation contained specific figures, named organisations, technical details, regulatory frameworks, or financial data, these must appear in the report. Do not generalise what was specific.

The report must follow this fixed structure exactly:

## 1. Executive Summary
A concise summary (3–5 sentences) of the topic explored and the key conclusions reached. The summary must convey how the panel's position evolved during the consultation, not just where it landed. If the panel's view changed materially during the conversation, this must be reflected.

## 2. Key Findings
The most important insights, analysis, and points raised during the consultation. Preserve specialist nuance and disagreement where it exists — do not flatten everything into consensus. Use clear, professional prose with a bold lead sentence for each discrete finding.

## 3. Specialist Perspectives
This section must explicitly distinguish between:
(a) Points of agreement across the panel
(b) Disagreements that were raised and subsequently resolved during the consultation — state what resolved them
(c) Disagreements or tensions that remain open and unresolved
Do not compress all of these into a single block. If no disagreements existed, state that clearly rather than inventing tension.

## 4. Conclusion
A direct, authoritative concluding statement that reflects the weight of the panel's analysis. The conclusion must acknowledge both the risk of acting without sufficient evidence and the risk of inaction or dismissal without proper analysis where relevant. This is not a summary — it should read as a considered professional judgement.

## 5. Knowledge Gaps & Limitations
Identify a minimum of 6 knowledge gaps. For each gap, state: what is unknown, why it matters to the decision or analysis, and what action would close it. Do not list gaps that were resolved during the consultation. Do not pad this section with generic caveats — every gap listed must be specific to this conversation.

Write in clear, professional British English. Avoid jargon unless it was used in the conversation and is appropriate to retain. Do not invent information not present in the conversation. Do not add caveats beyond what the panel itself raised.

Use ## for section headings and - for bullet points where appropriate. Do not add a title or preamble before the first section heading.\
"""


def _format_transcript(messages: list[dict]) -> str:
    lines = []
    for msg in messages:
        role = "User" if msg.get("role") == "user" else "Panel"
        content = msg.get("content", "").strip()
        if content:
            lines.append(f"**{role}:** {content}")
    return "\n\n".join(lines)


async def synthesise_report(
    messages: list[dict],
    room_name: str,
    title: str,
    user_name: str,
    date: str,
) -> str:
    """
    Call Claude to generate a structured markdown report from the conversation.
    Returns the markdown string.
    """
    client = Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    transcript = _format_transcript(messages)

    user_message = (
        f"Please write a professional report based on the following consultation session.\n\n"
        f"Report Title: {title}\n"
        f"Room: {room_name}\n"
        f"Prepared for: {user_name}\n"
        f"Date: {date}\n\n"
        f"TRANSCRIPT:\n\n{transcript}"
    )

    response = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=4096,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )
    return response.content[0].text
