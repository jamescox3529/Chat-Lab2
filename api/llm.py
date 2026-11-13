"""
LLM helpers
===========
Small, model-agnostic helpers shared by every Claude call site.

- response_text(): read the text out of a response by block type, never by
  position. Models with thinking return a ThinkingBlock before the text.
- no_thinking(): request kwargs that turn extended thinking off for a given
  model. The right parameter differs by model, so we set it explicitly rather
  than relying on model defaults (which changed silently with Sonnet 5.5).
"""
from __future__ import annotations

import sys

# Models where thinking cannot be switched off at all. The lowest setting is
# effort "low" (the model skips thinking on most simple requests).
_ALWAYS_THINKING_PREFIXES = ("claude-opus-5-5", "claude-fable-", "claude-mythos-")

# Models where {"type": "disabled"} is a 400 and {"type": "between_tools"}
# is the off switch (accepted only on these models, at effort "high" or below).
_BETWEEN_TOOLS_PREFIXES = ("claude-sonnet-5-5",)


def warn_if_truncated(response, label: str = "") -> None:
    """Log a warning when a call stopped because it hit max_tokens."""
    if getattr(response, "stop_reason", None) == "max_tokens":
        usage = getattr(response, "usage", None)
        out = getattr(usage, "output_tokens", "?") if usage else "?"
        model = getattr(response, "model", "?")
        print(
            f"[llm] WARNING max_tokens hit: model={model} output_tokens={out} {label}".rstrip(),
            file=sys.stderr,
            flush=True,
        )


def response_text(response, label: str = "") -> str:
    """Concatenate all text blocks; ignore thinking and other block types.
    Also logs a warning if the response was cut off at max_tokens."""
    warn_if_truncated(response, label)
    return "".join(
        b.text for b in response.content if getattr(b, "type", None) == "text"
    ).strip()


def no_thinking(model: str) -> dict:
    """
    Request kwargs that disable (or minimise) extended thinking for `model`.

    Use as: client.messages.create(model=m, ..., **no_thinking(m))
    """
    if model.startswith(_ALWAYS_THINKING_PREFIXES):
        return {"output_config": {"effort": "low"}}
    if model.startswith(_BETWEEN_TOOLS_PREFIXES):
        return {"thinking": {"type": "between_tools"}}
    # Opus 4.x, Sonnet 5 / 4.x, Haiku: explicit disabled is accepted.
    return {"thinking": {"type": "disabled"}}
