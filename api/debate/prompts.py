"""
Prompt builders for the debate engine.
"""

from __future__ import annotations

from typing import List


def build_debate_persona_system(
    role: str,
    knowledge_base: str,
    project_context: str,
) -> str:
    context_block = (
        f"\n\nPROJECT CONTEXT:\n{project_context}"
        if project_context else ""
    )

    return f"""\
You are a {role} participating in a structured expert debate.

YOUR KNOWLEDGE BASE:
{knowledge_base}
{context_block}

DEBATE CONDUCT:
- Speak with authority from your discipline — do not hedge unnecessarily
- Ground every claim in reasoning; do not make assertions without basis
- Challenge weak reasoning directly and honestly when you see it
- Flag assumptions explicitly — yours and others'
- Be willing to refine your position if presented with stronger evidence or reasoning
- Stay within your area of expertise; acknowledge where other disciplines are better placed
- Do not invent facts, figures, or standards — if uncertain, say so

Respond in the voice of a {role} who takes their professional judgement seriously.

Write in British English spelling and conventions throughout (e.g. optimise not optimize, behaviour not behavior, organise not organize, analyse not analyze)."""


def build_initial_position_prompt(question: str) -> str:
    return f"""\
DEBATE QUESTION:
{question}

State your position clearly. Structure your response as follows:

1. YOUR POSITION: State your stance on this question directly.
2. PRIMARY REASONING: 2-3 key points that support your position from your disciplinary perspective.
3. KEY RISKS: The most important risks or concerns your discipline would flag.
4. CRITICAL ASSUMPTIONS: What are you assuming that, if wrong, would change your position?

Keep your response to 250 words maximum. Be direct and substantive."""


def build_challenge_prompt(
    question: str,
    running_context: str,
    my_role: str,
    others_text: str,
) -> str:
    return f"""\
DEBATE QUESTION:
{question}

DEBATE SO FAR:
{running_context}

OTHER PARTICIPANTS' POSITIONS:
{others_text}

As the {my_role}, respond to the positions above:

1. WEAKEST ASSUMPTION: Identify the weakest assumption in any other participant's position and explain precisely why it is weak.
2. INTERDISCIPLINARY GAPS: Raise issues or considerations that others have missed from your disciplinary perspective.
3. YOUR REFINED POSITION: Defend or refine your own position in light of what others have said. If anything has changed your thinking, say so and explain why.

Keep your response to 200 words maximum. Be direct and specific."""


def build_convergence_prompt(
    question: str,
    running_context: str,
    my_role: str,
) -> str:
    return f"""\
DEBATE QUESTION:
{question}

FULL DEBATE SO FAR:
{running_context}

As the {my_role}, provide your final position:

1. FINAL POSITION: Your definitive stance on the question.
2. WHAT CHANGED: What shifted in your thinking during this debate and why.
3. WHAT YOU HOLD FIRM: The aspects of your position you maintain despite challenge, and why.
4. REMAINING DISAGREEMENT: What genuine disagreement do you still have with others, and what would resolve it?

Keep your response to 150 words maximum. Be precise."""


def build_synthesis_system() -> str:
    return """\
You are a debate moderator synthesising the output of a structured expert debate.

Your role:
- Summarise each participant's final position fairly and accurately
- Weigh the positions against each other — assess which arguments are better supported by reasoning and evidence, not just which view was held by more participants
- Draw a clear recommendation where the weight of reasoning supports one; state your confidence level and what drives it
- If the panel reached apparent consensus, probe whether it is genuine agreement or simply unchallenged assumption — note which it appears to be
- Represent genuine disagreement honestly — do not average it away or manufacture consensus where none exists
- Where participants diverged, explain the root cause of the disagreement (different assumptions, different disciplines, different risk tolerances) rather than just listing the positions
- Be transparent about the limits of the panel's knowledge
- Identify specifically what information was missing that would have materially strengthened or changed the recommendation

Write in clear, authoritative, professional British English. Use British spelling throughout (e.g. optimise, behaviour, organise, analyse). Produce your output in the exact markdown structure requested."""


def build_synthesis_user(
    question: str,
    running_context: str,
    roles: List[str],
) -> str:
    roles_list = ", ".join(roles)
    return f"""\
DEBATE QUESTION:
{question}

PARTICIPANTS: {roles_list}

FULL DEBATE TRANSCRIPT:
{running_context}

Synthesise this debate into the following exact structure:

## Positions Summary
[One paragraph per participant: their final position and key reasoning. Be accurate and fair to each.]

## Recommendation
[A clear recommendation based on where the panel converged. Where they diverged, represent both views honestly — do not force a consensus that does not exist.]

## Key Disagreements
[A bullet list of the specific points of genuine disagreement between participants, with a brief explanation of why each disagreement exists.]

## Missing Information
[A bullet list of specific data, analysis, or context that was absent from this debate and would have materially strengthened or changed the recommendation.]"""
