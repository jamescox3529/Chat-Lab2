"""
Config
======
Application-wide constants and configuration values.
"""

import os

# Claude models
MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514")
# Fast/cheap model for lightweight tasks (dispatcher, title generation)
FAST_MODEL = os.getenv("ANTHROPIC_FAST_MODEL", "claude-haiku-4-5-20250514")

# Document limits
DOC_CHAR_LIMIT = 50_000
TOTAL_DOC_CHAR_LIMIT = 150_000

# User profile option lists
# Each entry: (display_label, instruction_fragment)
# Empty label = "not set" — omitted from prompts.

EXPERIENCE_OPTIONS = [
    ("", None),
    (
        "I'm a generalist — I work across many disciplines",
        "is a generalist professional who works across many disciplines but is not a "
        "specialist in this area. Avoid unexplained jargon. Focus on practical "
        "implications and actionable guidance rather than deep technical detail. "
        "Flag clearly when something genuinely needs specialist input rather than "
        "giving false confidence.",
    ),
    (
        "I'm new to this field — I'm building my knowledge",
        "is new to this field and is actively building their knowledge. Explain "
        "terminology when you use it. Show how concepts connect across disciplines. "
        "Be educational as well as advisory — understanding why matters as much as "
        "knowing what.",
    ),
    (
        "I know an adjacent field well — this area is new to me",
        "is an experienced professional from an adjacent discipline — competent and "
        "intelligent, but new to this specific domain. Use a peer-to-peer tone. "
        "Focus on what is genuinely distinct or important when coming from outside "
        "this field. Do not over-explain fundamentals.",
    ),
    (
        "I'm a specialist in this area",
        "is an experienced specialist in this domain. Respond at full technical "
        "depth. Assume professional competence. No need to explain fundamentals. "
        "Challenge assumptions where warranted.",
    ),
]

TASK_OPTIONS = [
    ("", None),
    (
        "Understand something — I'm building a picture",
        "Their goal is to build understanding. Prioritise explanation, context, and "
        "showing how things connect across disciplines. A clear mental model matters "
        "more than a sharp recommendation.",
    ),
    (
        "Review or check something — sense-check a document or plan",
        "Their goal is to review or sense-check something. Prioritise identifying "
        "gaps, red flags, and what is missing or concerning. Be direct about "
        "weaknesses — do not soften findings.",
    ),
    (
        "Plan or scope something — I'm about to start something",
        "Their goal is to plan or scope something. Prioritise sequence, "
        "dependencies, and what needs to be considered and in what order. "
        "Practical structure matters more than exhaustive detail.",
    ),
    (
        "Make a decision — I have options and need help choosing",
        "Their goal is to make a decision. Prioritise clear analysis of "
        "implications and a directional recommendation. Do not leave them without "
        "a steer.",
    ),
    (
        "Produce something — I'm writing a report, bid, or document",
        "Their goal is to produce a written output. Prioritise structure, what to "
        "include, and how to frame content. Give them material they can work with "
        "directly.",
    ),
]

UNCERTAINTY_OPTIONS = [
    ("", None),
    (
        "Give me your best recommendation, even if uncertain",
        "On uncertainty: commit to a clear recommendation even where certainty is "
        "limited. The person wants a steer, not a hedge. Acknowledge uncertainty "
        "briefly if necessary, but do not let it dominate or replace a conclusion.",
    ),
    (
        "Show me the range of views — I'll decide",
        "On uncertainty: present the range of reasonable professional views. Do not "
        "force a single recommendation. Let the person draw their own conclusion "
        "from the options laid out.",
    ),
    (
        "Flag uncertainty clearly, but still give me a steer",
        "On uncertainty: flag clearly where there is genuine uncertainty or "
        "professional disagreement, but still provide a directional steer. "
        "Uncertainty and a recommendation can coexist — name both.",
    ),
]

USE_OPTIONS = [
    ("", None),
    (
        "Have a conversation or meeting",
        "They will use this in a conversation or meeting. Prioritise clear, "
        "memorable, verbally-deliverable points they can say and defend out loud. "
        "Avoid long lists.",
    ),
    (
        "Write something up",
        "They are writing something up. Structured depth and well-framed content "
        "is valuable. Give them material they can use directly.",
    ),
    (
        "Make a personal decision",
        "They are making a personal decision. Direct implications and clear "
        "reasoning matter most. Keep it grounded rather than abstract.",
    ),
    (
        "Brief someone more senior",
        "They are briefing someone more senior. Lead with the headline or "
        "recommendation. Put supporting reasoning behind it. Executive-ready "
        "framing throughout.",
    ),
]

INFRA_MANAGERS = [
    "", "Network Rail", "Transport for London (TfL)", "Transport for Wales",
    "Transport Scotland / ScotRail", "Merseytravel / Merseyrail",
    "Nexus (Tyne and Wear Metro)", "HS2 Ltd", "Heathrow Express",
    "DLR", "London Underground", "Other",
]

INFRA_TYPES = [
    "", "Track & Permanent Way", "Signalling & Control Systems",
    "Telecoms & IT Infrastructure", "Electrification & OLE", "Premises & Stations",
    "Civil Structures & Earthworks", "Tunnels & Bridges", "Drainage & Lineside",
    "Rolling Stock Maintenance Facilities", "Multi-Discipline",
]

CONTRACT_TYPES = [
    "", "NEC4 Engineering & Construction Contract (ECC)",
    "NEC3 Engineering & Construction Contract (ECC)",
    "NEC4 Professional Services Contract (PSC)",
    "NEC4 Term Service Contract (TSC)", "NEC4 Framework Contract (FC)",
    "JCT Design and Build", "JCT Standard Building Contract",
    "Measured Term Contract", "Other",
]

CONTRACT_OPTIONS = [
    "", "Option A — Priced (Activity Schedule)", "Option B — Priced (Bill of Quantities)",
    "Option C — Target (Activity Schedule)", "Option D — Target (Bill of Quantities)",
    "Option E — Cost Reimbursable", "Option F — Management Contract",
]

PROJECT_VALUES = [
    "", "Under £1M", "£1M – £5M", "£5M – £25M",
    "£25M – £100M", "£100M – £500M", "Over £500M",
]
