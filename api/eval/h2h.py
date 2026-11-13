"""
Head-to-head eval
=================
Compares Roundtable against plain single-model answers on hard questions,
judged blind and pairwise. Questions live in knowledge/evals/h2h_questions.yaml.

Arms:
  roundtable  the real pipeline (run_pipeline), no conversation is created
  sonnet      claude-sonnet-5-5, no system prompt, thinking off (as the product)
  opus        claude-opus-5-5, no system prompt, default settings

Endpoints are plain `def` so FastAPI runs them in its threadpool: the
frontend fires the three arms in parallel and the blocking SDK calls must not
serialise on the event loop.
"""
from __future__ import annotations

import asyncio
import json
import re
import time
from functools import lru_cache
from pathlib import Path

import yaml
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.auth import get_current_user_id
from api.llm import no_thinking, response_text
from api.pipeline.pipeline import run_pipeline, _get_client
from api.pipeline.prompts import build_project_context
from api.rooms.loader import get_room

router = APIRouter(prefix="/api/eval/h2h", tags=["eval-h2h"])

QUESTIONS_FILE = Path(__file__).parent.parent.parent / "knowledge" / "evals" / "h2h_questions.yaml"

SONNET_MODEL = "claude-sonnet-5-5"
OPUS_MODEL = "claude-opus-5-5"
JUDGE_MODEL = "claude-opus-5-5"

SONNET_MAX_TOKENS = 4000
# Opus 5.5 always thinks, and thinking counts toward max_tokens. 4000 left too
# little room for thinking plus a full answer, so give it headroom.
OPUS_MAX_TOKENS = 16000
JUDGE_MAX_TOKENS = 16000


# ---------------------------------------------------------------------------
# Questions
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def _load_questions() -> list[dict]:
    with open(QUESTIONS_FILE, encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    questions = []
    for q in data.get("questions", []):
        room = get_room(q["room_id"])
        questions.append({
            "id": q["id"],
            "room_id": q["room_id"],
            "room_name": room.name if room else q["room_id"],
            "project_config": q.get("project_config", {}) or {},
            "question": " ".join(str(q["question"]).split()),
        })
    return questions


def _get_question(question_id: str) -> dict:
    for q in _load_questions():
        if q["id"] == question_id:
            return q
    raise HTTPException(status_code=404, detail=f"Question '{question_id}' not found")


def _project_context(q: dict) -> str:
    """Built exactly as /chat does, with no documents."""
    room = get_room(q["room_id"])
    field_labels = {f.key: f.label for f in room.project_context} if room else {}
    return build_project_context(q["project_config"], [], field_labels)


@router.get("/questions")
def h2h_questions(user_id: str = Depends(get_current_user_id)):
    return {"questions": _load_questions()}


# ---------------------------------------------------------------------------
# Answers
# ---------------------------------------------------------------------------

class AnswerRequest(BaseModel):
    question_id: str
    arm: str  # "roundtable" | "sonnet" | "opus"


def _run_roundtable(q: dict, project_context: str) -> dict:
    """Consume run_pipeline server-side. Nothing is written to Supabase."""
    usage: list[dict] = []
    tokens: list[str] = []
    plan: list[dict] = []
    panel: list[str] = []
    errors: list[str] = []

    async def consume() -> None:
        async for ev in run_pipeline(
            q["room_id"], q["question"], [], project_context,
            user_instruction="", user_profile={}, usage_sink=usage,
        ):
            t = ev.get("type")
            if t == "token":
                tokens.append(ev["content"])
            elif t == "plan":
                plan.extend(ev.get("questions", []))
            elif t == "done":
                panel.extend(ev.get("panel", []))
            elif t == "error":
                errors.append(ev.get("content", "unknown error"))

    # This runs in a threadpool worker, which has no event loop of its own.
    asyncio.run(consume())
    if errors:
        raise HTTPException(status_code=502, detail="; ".join(errors))

    return {
        "answer": "".join(tokens).strip(),
        "plan": plan,
        "panel": panel,
        "usage": usage,
        "input_tokens": sum(u["input_tokens"] for u in usage),
        "output_tokens": sum(u["output_tokens"] for u in usage),
    }


def _run_single(model: str, max_tokens: int, extra: dict, user_content: str, label: str) -> dict:
    client = _get_client()
    response = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": user_content}],
        **extra,
    )
    if response.stop_reason == "refusal":
        raise HTTPException(status_code=502, detail=f"{label}: model declined to answer (refusal)")
    usage = [{
        "stage": label,
        "model": response.model,
        "input_tokens": response.usage.input_tokens,
        "output_tokens": response.usage.output_tokens,
    }]
    return {
        "answer": response_text(response, label),
        "usage": usage,
        "input_tokens": response.usage.input_tokens,
        "output_tokens": response.usage.output_tokens,
        "stop_reason": response.stop_reason,
    }


@router.post("/answer")
def h2h_answer(body: AnswerRequest, user_id: str = Depends(get_current_user_id)):
    q = _get_question(body.question_id)
    project_context = _project_context(q)
    # What a user pasting into a chatbot would send.
    plain_prompt = f"{project_context}\n\n{q['question']}".strip()

    started = time.monotonic()
    if body.arm == "roundtable":
        result = _run_roundtable(q, project_context)
    elif body.arm == "sonnet":
        result = _run_single(SONNET_MODEL, SONNET_MAX_TOKENS, no_thinking(SONNET_MODEL), plain_prompt, "h2h-sonnet")
    elif body.arm == "opus":
        # Default settings on purpose: we want Opus at its best, not throttled.
        result = _run_single(OPUS_MODEL, OPUS_MAX_TOKENS, {}, plain_prompt, "h2h-opus")
    else:
        raise HTTPException(status_code=400, detail=f"Unknown arm '{body.arm}'")

    result["arm"] = body.arm
    result["latency_ms"] = int((time.monotonic() - started) * 1000)
    return result


# ---------------------------------------------------------------------------
# Judge
# ---------------------------------------------------------------------------

class JudgeRequest(BaseModel):
    question_id: str
    answer_1: str
    answer_2: str


CRITERIA = ["accuracy", "depth", "risks", "actionability"]


def _build_judge_prompt(q: dict, project_context: str, answer_1: str, answer_2: str) -> str:
    return f"""You are a senior UK practitioner in {q['room_name']}. A client has asked the question below, with the project context shown. Two advisers have each written an answer. Review both as you would review work before it goes to a client.

{project_context or "PROJECT CONTEXT: (none given)"}

CLIENT QUESTION:
{q['question']}

<answer_1>
{answer_1}
</answer_1>

<answer_2>
{answer_2}
</answer_2>

How to judge:
- Judge substance only. Ignore formatting, headings and length for its own sake. A longer answer is better only if the extra content is correct and useful.
- Ignore phrasing such as "the panel", "we", or "specialists agree". It must count neither for nor against an answer.
- Name every factual error or invented specific (a standard, clause, regulation, deadline, figure or body that is wrong or does not exist). These weigh heavily: an answer that is confidently wrong on a point the client would act on is worse than one that is less detailed but correct.

Score each answer from 1 (poor) to 5 (excellent) on:
- accuracy: accuracy and UK / jurisdictional correctness
- depth: depth and specificity to this client's situation
- risks: risks, trade-offs and uncertainty handled honestly
- actionability: how clearly the client knows what to do next

Then give an overall verdict: "answer_1", "answer_2" or "tie", and a one-paragraph rationale.

Return strict JSON only, no prose before or after, in exactly this shape:
{{
  "answer_1": {{"accuracy": <1-5>, "depth": <1-5>, "risks": <1-5>, "actionability": <1-5>, "errors": ["<each factual error or invented specific>"]}},
  "answer_2": {{"accuracy": <1-5>, "depth": <1-5>, "risks": <1-5>, "actionability": <1-5>, "errors": ["..."]}},
  "verdict": "answer_1" | "answer_2" | "tie",
  "rationale": "<one paragraph>"
}}"""


def _parse_json(raw: str) -> dict:
    """Same fence handling as eval_assess, plus a fallback to the outermost {...}."""
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            return json.loads(m.group(0))
        raise


@router.post("/judge")
def h2h_judge(body: JudgeRequest, user_id: str = Depends(get_current_user_id)):
    q = _get_question(body.question_id)
    prompt = _build_judge_prompt(q, _project_context(q), body.answer_1, body.answer_2)

    client = _get_client()
    started = time.monotonic()
    # Judge on default settings: Opus 5.5 can't turn thinking off, and it helps.
    response = client.messages.create(
        model=JUDGE_MODEL,
        max_tokens=JUDGE_MAX_TOKENS,
        messages=[{"role": "user", "content": prompt}],
    )
    if response.stop_reason == "refusal":
        raise HTTPException(status_code=502, detail="Judge declined to answer (refusal)")
    raw = response_text(response, "h2h-judge")

    try:
        result = _parse_json(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"Judge parse error: {exc}\n\nRaw: {raw[:500]}")

    if result.get("verdict") not in ("answer_1", "answer_2", "tie"):
        result["verdict"] = "tie"
    for side in ("answer_1", "answer_2"):
        scores = result.get(side) or {}
        for c in CRITERIA:
            try:
                scores[c] = max(1, min(5, int(scores.get(c, 0))))
            except (TypeError, ValueError):
                scores[c] = None
        scores.setdefault("errors", [])
        result[side] = scores

    result["truncated"] = response.stop_reason == "max_tokens"
    result["usage"] = {
        "model": response.model,
        "input_tokens": response.usage.input_tokens,
        "output_tokens": response.usage.output_tokens,
    }
    result["latency_ms"] = int((time.monotonic() - started) * 1000)
    return result
