"""
Debate Engine
=============
Async generator that runs a multi-round structured debate between personas
and yields SSE event dicts.

Rounds by depth:
  QUICK     → Initial Positions + Synthesis
  STANDARD  → Initial Positions + Challenge + Synthesis
  THOROUGH  → Initial Positions + Challenge + Convergence + Synthesis

Each round (except Synthesis) runs all personas IN PARALLEL using
asyncio.gather + loop.run_in_executor, matching the pipeline.py pattern.

Yields:
  {"type": "status",  "content": "..."}
  {"type": "token",   "content": "..."}
  {"type": "done",    "debate_id": "..."}
  {"type": "error",   "content": "..."}
"""

from __future__ import annotations

import asyncio
import os
from typing import AsyncIterator, Dict, List

import anthropic

from api.config import MODEL, POWER_MODEL, TOKEN_BUDGETS
from api.personas.loader import load_personas
from api.debate.prompts import (
    build_debate_persona_system,
    build_initial_position_prompt,
    build_challenge_prompt,
    build_convergence_prompt,
    build_synthesis_system,
    build_synthesis_user,
)

# Token budgets per depth tier — mirrors the pipeline complexity tiers.
# thorough = high: more room for each round + Opus synthesis.
_DEBATE_BUDGETS = {
    "quick":    {"persona": TOKEN_BUDGETS["low"]["persona"],      "synthesis": TOKEN_BUDGETS["low"]["synthesiser"]},
    "standard": {"persona": TOKEN_BUDGETS["standard"]["persona"], "synthesis": TOKEN_BUDGETS["standard"]["synthesiser"]},
    "thorough": {"persona": TOKEN_BUDGETS["high"]["persona"],     "synthesis": TOKEN_BUDGETS["high"]["synthesiser"]},
}


def _get_client() -> anthropic.Anthropic:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY environment variable not set")
    return anthropic.Anthropic(api_key=api_key)


def _call_persona_round(
    client: anthropic.Anthropic,
    persona_id: str,
    role: str,
    knowledge_base: str,
    project_context: str,
    prompt: str,
    token_budget: int = 900,
) -> tuple[str, str]:
    """Call a persona for a single debate round. Returns (persona_id, response)."""
    system = build_debate_persona_system(role, knowledge_base, project_context)
    response = client.messages.create(
        model=MODEL,
        max_tokens=token_budget,
        system=system,
        messages=[{"role": "user", "content": prompt}],
    )
    return persona_id, response.content[0].text.strip()


async def run_debate(
    debate_id: str,
    question: str,
    persona_ids: List[str],
    depth: str,
    project_context: str,
) -> AsyncIterator[dict]:
    """
    Async generator that yields SSE event dicts for the full debate.
    depth: "quick" | "standard" | "thorough"
    """
    all_personas = load_personas()

    # Resolve personas — skip any that don't exist
    personas = {
        pid: all_personas[pid]
        for pid in persona_ids
        if pid in all_personas
    }

    if not personas:
        yield {"type": "error", "content": "No valid personas found for the given IDs"}
        return

    client = _get_client()
    loop = asyncio.get_running_loop()

    # Resolve token budgets and synthesis model from depth
    budgets = _DEBATE_BUDGETS.get(depth, _DEBATE_BUDGETS["standard"])
    persona_tokens = budgets["persona"]
    synthesis_tokens = budgets["synthesis"]
    synthesis_model = POWER_MODEL if depth == "thorough" else MODEL

    # running_context accumulates all round output for context in later rounds
    running_context_parts: List[str] = []

    try:
        # ── Round 1: Initial Positions ────────────────────────────────────────

        roles_label = ", ".join(p.role for p in personas.values())
        yield {"type": "status", "content": f"Round 1 — Initial positions: {roles_label}"}

        prompt_r1 = build_initial_position_prompt(question)

        async def _initial_async(pid: str) -> tuple[str, str]:
            persona = personas[pid]
            return await loop.run_in_executor(
                None,
                _call_persona_round,
                client, pid, persona.role, persona.knowledge_base, project_context, prompt_r1,
                persona_tokens,
            )

        results_r1 = await asyncio.gather(*[_initial_async(pid) for pid in personas])
        responses_r1: Dict[str, str] = dict(results_r1)

        # Append round 1 to running context
        running_context_parts.append("=== ROUND 1: INITIAL POSITIONS ===")
        for pid, response in responses_r1.items():
            role = personas[pid].role
            running_context_parts.append(f"\n--- {role} ---\n{response}")

        # ── Round 2: Challenge (standard + thorough) ──────────────────────────

        if depth in ("standard", "thorough"):
            yield {"type": "status", "content": "Round 2 — Challenge…"}

            running_context = "\n".join(running_context_parts)

            async def _challenge_async(pid: str) -> tuple[str, str]:
                persona = personas[pid]
                others_parts = []
                for other_pid, other_resp in responses_r1.items():
                    if other_pid != pid:
                        others_parts.append(f"--- {personas[other_pid].role} ---\n{other_resp}")
                others_text = "\n\n".join(others_parts)

                prompt_r2 = build_challenge_prompt(
                    question=question,
                    running_context=running_context,
                    my_role=persona.role,
                    others_text=others_text,
                )
                return await loop.run_in_executor(
                    None,
                    _call_persona_round,
                    client, pid, persona.role, persona.knowledge_base, project_context, prompt_r2,
                    persona_tokens,
                )

            results_r2 = await asyncio.gather(*[_challenge_async(pid) for pid in personas])
            responses_r2: Dict[str, str] = dict(results_r2)

            running_context_parts.append("\n=== ROUND 2: CHALLENGE ===")
            for pid, response in responses_r2.items():
                role = personas[pid].role
                running_context_parts.append(f"\n--- {role} ---\n{response}")

        # ── Round 3: Convergence (thorough only) ──────────────────────────────

        if depth == "thorough":
            yield {"type": "status", "content": "Round 3 — Convergence…"}

            running_context = "\n".join(running_context_parts)

            async def _convergence_async(pid: str) -> tuple[str, str]:
                persona = personas[pid]
                prompt_r3 = build_convergence_prompt(
                    question=question,
                    running_context=running_context,
                    my_role=persona.role,
                )
                return await loop.run_in_executor(
                    None,
                    _call_persona_round,
                    client, pid, persona.role, persona.knowledge_base, project_context, prompt_r3,
                    persona_tokens,
                )

            results_r3 = await asyncio.gather(*[_convergence_async(pid) for pid in personas])
            responses_r3: Dict[str, str] = dict(results_r3)

            running_context_parts.append("\n=== ROUND 3: CONVERGENCE ===")
            for pid, response in responses_r3.items():
                role = personas[pid].role
                running_context_parts.append(f"\n--- {role} ---\n{response}")

        # ── Synthesis (streaming) ─────────────────────────────────────────────

        yield {"type": "status", "content": "Synthesising debate outcome…"}

        full_context = "\n".join(running_context_parts)
        roles = [p.role for p in personas.values()]

        system = build_synthesis_system()
        user_msg = build_synthesis_user(question, full_context, roles)

        with client.messages.stream(
            model=synthesis_model,
            max_tokens=synthesis_tokens,
            system=system,
            messages=[{"role": "user", "content": user_msg}],
        ) as stream:
            for text in stream.text_stream:
                yield {"type": "token", "content": text}

        yield {"type": "done", "debate_id": debate_id}

    except Exception as exc:
        yield {"type": "error", "content": f"Debate error: {exc}"}
