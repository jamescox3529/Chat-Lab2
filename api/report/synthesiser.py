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

The report must follow this fixed structure exactly:

## 1. Executive Summary
A concise summary (3–5 sentences) of the topic explored and the key conclusions reached.

## 2. Key Findings
The most important insights, analysis, and points raised during the consultation. Preserve specialist nuance and disagreement where it exists — do not flatten everything into consensus. Use clear, professional prose.

## 3. Specialist Perspectives
A section that captures where specialists agreed, where they diverged, and what tensions or trade-offs were identified. This section should reflect the multi-perspective nature of the Roundtable panel.

## 4. Conclusion
A clear, direct concluding statement that reflects the weight of the panel's analysis. This is not a summary — it should read as a considered professional judgement.

## 5. Knowledge Gaps & Limitations
What the panel flagged as uncertain, unresolved, or requiring further input. What additional information would sharpen the advice. This section is important — do not omit it or minimise it.

Write in clear, professional British English. Use formal but accessible prose — avoid jargon unless it was used in the conversation and is appropriate to retain. Do not invent information not present in the conversation. Do not add caveats beyond what the panel itself raised.

The tone should reflect a senior professional document — the kind that would be circulated internally or presented to a client.

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
