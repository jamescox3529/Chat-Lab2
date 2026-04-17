"use client";

import { useState, useRef, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { createConversation, streamChat, setAuthToken } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlannedQuestion {
  id: string;
  summary: string;
  personas: string[];
}

interface PersonaCapture {
  persona_id: string;
  role: string;
  response: string;
}

interface RunState {
  status: "idle" | "running" | "done" | "error";
  streamLog: string[];
  planQuestions: PlannedQuestion[];
  personaResponses: PersonaCapture[];
  panel: string[];
  synthesis: string;
  error?: string;
}

interface AssessmentRouting {
  score: number;
  commentary: string;
  missed: string[];
  unnecessary: string[];
}

interface AssessmentPersona {
  persona_id: string;
  role: string;
  score: number;
  commentary: string;
}

interface AssessmentSynthesis {
  score: number;
  commentary: string;
}

interface Assessment {
  status: "idle" | "assessing" | "done" | "error";
  routing?: AssessmentRouting;
  persona_quality?: AssessmentPersona[];
  synthesis?: AssessmentSynthesis;
  overall?: string;
  error?: string;
}

interface TestCase {
  id: string;
  label: string;
  question: string;
  grip_stage: string;
  contract_type: string;
  expected_personas: string[];
  eval_focus: string;
  config_labels?: { label: string; value: string }[];
}

type RoomId = "railway_engineering" | "simply_lean";

interface RoomDef {
  id: RoomId;
  name: string;
  testCases: TestCase[];
}

// ---------------------------------------------------------------------------
// Room and test case definitions
// ---------------------------------------------------------------------------

const RAILWAY_CASES: TestCase[] = [
  {
    id: "tc1",
    label: "RAMS at GRIP 3",
    question:
      "What RAMS requirements apply at GRIP 3 for a new signalling system on a Network Rail mainline?",
    grip_stage: "GRIP 3 — Single Option Development",
    contract_type: "NEC4 Engineering & Construction Contract (ECC)",
    expected_personas: ["sig_eng", "hs", "sig_test_comm", "rail_ops"],
    eval_focus: "routing",
  },
  {
    id: "tc2",
    label: "NEC4 compensation event exposure",
    question:
      "We have an NEC4 ECC contract and the contractor is claiming compensation events for unforeseen ground conditions. What is our exposure and how should we respond?",
    grip_stage: "GRIP 5 — Detail Design",
    contract_type: "NEC4 Engineering & Construction Contract (ECC)",
    expected_personas: ["pm", "qs", "contracts_mgr", "legal"],
    eval_focus: "routing",
  },
  {
    id: "tc3",
    label: "Ballasted track derailment risks",
    question:
      "What are the key derailment risk factors on a 60-year-old ballasted track approaching renewal? We are assessing whether to maintain or replace.",
    grip_stage: "GRIP 2 — Feasibility",
    contract_type: "",
    expected_personas: ["track_eng", "geotech_eng"],
    eval_focus: "persona",
  },
  {
    id: "tc4",
    label: "GRIP 5 behind programme",
    question:
      "We are at GRIP 5 and six weeks behind programme with a fixed completion date. What are our realistic options?",
    grip_stage: "GRIP 5 — Detail Design",
    contract_type: "NEC4 Engineering & Construction Contract (ECC)",
    expected_personas: ["pm", "planner", "constr_eng", "qs", "contracts_mgr"],
    eval_focus: "synthesis",
  },
  {
    id: "tc5",
    label: "Environmental consents — level crossing",
    question:
      "What environmental consents and surveys do we need for a level crossing upgrade in a rural area with potential ecological sensitivity?",
    grip_stage: "GRIP 3 — Single Option Development",
    contract_type: "",
    expected_personas: ["env", "planner"],
    eval_focus: "routing",
  },
];

// Lean persona IDs verified against knowledge/rooms/simply_lean.yaml:
// lean_sensei, ops_mgr, change_mgmt, process_eng, biz_analyst, sc_strategist, ci_coach
const LEAN_CASES: TestCase[] = [
  {
    id: "tc1",
    label: "VSM and waste identification",
    question:
      "We are at the start of a Lean transformation and want to map our current state value stream. What wastes should we be looking for and how do we prioritise them?",
    grip_stage: "Lean / TPS",
    contract_type: "",
    expected_personas: ["lean_sensei", "ops_mgr", "process_eng"],
    eval_focus: "routing",
    config_labels: [
      { label: "Methodology", value: "Lean / TPS" },
      { label: "Organisation type", value: "Manufacturing" },
      { label: "Maturity level", value: "Early adoption" },
    ],
  },
  {
    id: "tc2",
    label: "Six Sigma defect rate reduction",
    question:
      "Our defect rate on a critical assembly line has increased from 1.2% to 3.8% over the last quarter. We need to understand root cause and reduce it back below 1%. What approach should we take?",
    grip_stage: "Six Sigma / DMAIC",
    contract_type: "",
    expected_personas: ["ci_coach", "process_eng", "ops_mgr"],
    eval_focus: "routing",
    config_labels: [
      { label: "Methodology", value: "Six Sigma" },
      { label: "Organisation type", value: "Assembly" },
      { label: "Maturity level", value: "Developing" },
    ],
  },
  {
    id: "tc3",
    label: "Kanban implementation depth test",
    question:
      "We want to implement a Kanban pull system to replace our current push scheduling. What are the key design decisions and what are the most common failure modes?",
    grip_stage: "Lean / TPS",
    contract_type: "",
    expected_personas: ["lean_sensei", "ops_mgr", "sc_strategist"],
    eval_focus: "persona",
    config_labels: [
      { label: "Methodology", value: "Lean / TPS" },
      { label: "Organisation type", value: "Manufacturing" },
      { label: "Maturity level", value: "Developing" },
    ],
  },
  {
    id: "tc4",
    label: "Transformation stall at scale",
    question:
      "We are 18 months into a Lean transformation. Shop floor improvements are delivering results but middle management are not engaged and the programme is stalling. What are our options?",
    grip_stage: "Lean / TPS",
    contract_type: "",
    expected_personas: ["lean_sensei", "change_mgmt", "ops_mgr", "biz_analyst"],
    eval_focus: "synthesis",
    config_labels: [
      { label: "Methodology", value: "Lean / TPS" },
      { label: "Organisation type", value: "Manufacturing" },
      { label: "Maturity level", value: "Developing" },
    ],
  },
  {
    id: "tc5",
    label: "5S in a chemical processing facility",
    question:
      "We are implementing 5S across a chemical processing facility. What safety considerations and regulatory requirements should we be factoring into our implementation plan?",
    grip_stage: "Lean / TPS",
    contract_type: "",
    expected_personas: ["lean_sensei", "process_eng", "ops_mgr"],
    eval_focus: "routing",
    config_labels: [
      { label: "Methodology", value: "Lean / TPS" },
      { label: "Organisation type", value: "Processing" },
      { label: "Maturity level", value: "Early adoption" },
    ],
  },
];

const ROOMS: RoomDef[] = [
  { id: "railway_engineering", name: "Railway Engineering", testCases: RAILWAY_CASES },
  { id: "simply_lean", name: "Lean Manufacturing", testCases: LEAN_CASES },
];

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ScoreBadge({ score }: { score: number }) {
  const colors: Record<number, string> = {
    1: "bg-red-100 text-red-700",
    2: "bg-orange-100 text-orange-700",
    3: "bg-yellow-100 text-yellow-700",
    4: "bg-green-100 text-green-700",
    5: "bg-emerald-100 text-emerald-700",
  };
  return (
    <span
      className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-semibold ${colors[score] ?? "bg-zinc-100 text-zinc-600"}`}
    >
      {score}
    </span>
  );
}

function StatusDot({
  status,
}: {
  status: "idle" | "running" | "done" | "error";
}) {
  if (status === "idle")
    return <span className="w-2 h-2 rounded-full bg-zinc-300 inline-block" />;
  if (status === "running")
    return (
      <span className="w-2 h-2 rounded-full bg-blue-400 inline-block animate-pulse" />
    );
  if (status === "done")
    return <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />;
  return <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />;
}

// ---------------------------------------------------------------------------
// Room selector screen
// ---------------------------------------------------------------------------

function RoomSelector({ onSelect }: { onSelect: (id: RoomId) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-zinc-50">
      <div className="w-full max-w-md px-8">
        <div className="mb-8">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
            Roundtable Eval
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Select a room to begin
          </p>
        </div>
        <div className="space-y-3">
          {ROOMS.map((room) => (
            <button
              key={room.id}
              onClick={() => onSelect(room.id)}
              className="w-full text-left px-5 py-4 bg-white border border-zinc-200 rounded-lg hover:border-zinc-400 hover:bg-zinc-50 transition-all group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-zinc-900">
                    {room.name}
                  </p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {room.testCases.length} test cases
                  </p>
                </div>
                <span className="text-zinc-300 group-hover:text-zinc-500 transition-colors">
                  →
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function EvalPage() {
  const { getToken } = useAuth();
  const [activeRoom, setActiveRoom] = useState<RoomDef | null>(null);
  const [activeId, setActiveId] = useState<string>("");
  const [runs, setRuns] = useState<Record<string, RunState>>({});
  const [assessments, setAssessments] = useState<Record<string, Assessment>>({});
  const abortRefs = useRef<Record<string, boolean>>({});

  const selectRoom = useCallback((id: RoomId) => {
    const room = ROOMS.find((r) => r.id === id)!;
    setActiveRoom(room);
    setActiveId(room.testCases[0].id);
    setRuns({});
    setAssessments({});
  }, []);

  const switchRoom = useCallback(() => {
    const running = Object.values(runs).some((r) => r.status === "running");
    if (running) {
      if (!confirm("A test is currently running. Switch room and discard results?")) return;
    }
    setActiveRoom(null);
    setActiveId("");
    setRuns({});
    setAssessments({});
  }, [runs]);

  if (!activeRoom) {
    return <RoomSelector onSelect={selectRoom} />;
  }

  const TEST_CASES = activeRoom.testCases;
  const activeTest = TEST_CASES.find((t) => t.id === activeId)!;
  const activeRun = runs[activeId];
  const activeAssessment = assessments[activeId];

  // ── Run a single test ──────────────────────────────────────────────────────

  async function runTest(tc: TestCase) {
    abortRefs.current[tc.id] = false;

    setRuns((prev) => ({
      ...prev,
      [tc.id]: {
        status: "running",
        streamLog: [],
        planQuestions: [],
        personaResponses: [],
        panel: [],
        synthesis: "",
      },
    }));
    setAssessments((prev) => ({ ...prev, [tc.id]: { status: "idle" } }));
    setActiveId(tc.id);

    const appendLog = (line: string) =>
      setRuns((prev) => ({
        ...prev,
        [tc.id]: {
          ...prev[tc.id],
          streamLog: [...(prev[tc.id]?.streamLog ?? []), line],
        },
      }));

    try {
      const token = await getToken();
      setAuthToken(token);

      const conv = await createConversation(activeRoom!.id, {
        project_config: {
          grip_stage: tc.grip_stage,
          contract_type: tc.contract_type,
        },
        user_profile: {},
        document_ids: [],
      });

      appendLog(`▶ Conversation created: ${conv.id}`);

      let synthesis = "";
      let panel: string[] = [];
      const planQuestions: PlannedQuestion[] = [];
      const personaResponses: PersonaCapture[] = [];

      for await (const event of streamChat(conv.id, tc.question)) {
        if (abortRefs.current[tc.id]) break;

        if (event.type === "status") {
          appendLog(`◆ ${event.content}`);
        } else if (event.type === "plan") {
          planQuestions.push(...event.questions);
          for (const q of event.questions) {
            appendLog(
              `  Plan Q${q.id}: "${q.summary}" → [${q.personas.join(", ")}]`
            );
          }
          setRuns((prev) => ({
            ...prev,
            [tc.id]: { ...prev[tc.id], planQuestions: [...planQuestions] },
          }));
        } else if (event.type === "persona") {
          personaResponses.push({
            persona_id: event.persona_id,
            role: event.role,
            response: event.response,
          });
          appendLog(
            `  ✓ ${event.role} (${event.persona_id}) — ${event.response.length} chars`
          );
          setRuns((prev) => ({
            ...prev,
            [tc.id]: {
              ...prev[tc.id],
              personaResponses: [...personaResponses],
            },
          }));
        } else if (event.type === "token") {
          synthesis += event.content;
          setRuns((prev) => ({
            ...prev,
            [tc.id]: { ...prev[tc.id], synthesis },
          }));
        } else if (event.type === "done") {
          panel = event.panel;
          appendLog(`✔ Done — panel: [${panel.join(", ")}]`);
        } else if (event.type === "error") {
          throw new Error(event.content);
        }
      }

      setRuns((prev) => ({
        ...prev,
        [tc.id]: {
          ...prev[tc.id],
          status: "done",
          panel,
          synthesis,
          planQuestions,
          personaResponses,
        },
      }));

      await runAssessment(tc, panel, planQuestions, personaResponses, synthesis, token);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setRuns((prev) => ({
        ...prev,
        [tc.id]: { ...prev[tc.id], status: "error", error: msg },
      }));
    }
  }

  // ── Run assessment ─────────────────────────────────────────────────────────

  async function runAssessment(
    tc: TestCase,
    panel: string[],
    planQuestions: PlannedQuestion[],
    personaResponses: PersonaCapture[],
    synthesis: string,
    token: string | null
  ) {
    setAssessments((prev) => ({ ...prev, [tc.id]: { status: "assessing" } }));

    try {
      const res = await fetch(`${BASE}/api/eval/assess`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          question: tc.question,
          grip_stage: tc.grip_stage,
          contract_type: tc.contract_type,
          expected_personas: tc.expected_personas,
          actual_panel: panel,
          planned_questions: planQuestions,
          persona_responses: personaResponses,
          synthesis,
          eval_focus: tc.eval_focus,
        }),
      });

      if (!res.ok) {
        const detail = await res.text();
        throw new Error(`Assessment failed ${res.status}: ${detail}`);
      }

      const data = await res.json();
      setAssessments((prev) => ({ ...prev, [tc.id]: { status: "done", ...data } }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setAssessments((prev) => ({ ...prev, [tc.id]: { status: "error", error: msg } }));
    }
  }

  // ── Download result as markdown ───────────────────────────────────────────

  function downloadResult(tcId: string) {
    const tc = TEST_CASES.find((t) => t.id === tcId);
    const run = runs[tcId];
    const assess = assessments[tcId];
    if (!tc || !run || !assess || assess.status !== "done") return;

    const score = (n: number) => `${"★".repeat(n)}${"☆".repeat(5 - n)} ${n}/5`;
    const tcNum = tcId.replace("tc", "");
    const roomSlug = activeRoom!.id.replace("_", "-");

    const lines: string[] = [
      `# Roundtable Eval — ${tc.label}`,
      `**Date:** ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`,
      "",
      "## Question",
      tc.question,
      "",
    ];

    if (tc.config_labels && tc.config_labels.length > 0) {
      for (const cl of tc.config_labels) {
        lines.push(`**${cl.label}:** ${cl.value}  `);
      }
    } else {
      if (tc.grip_stage) lines.push(`**GRIP Stage:** ${tc.grip_stage}  `);
      if (tc.contract_type) lines.push(`**Contract:** ${tc.contract_type}  `);
    }
    lines.push(
      `**Expected panel:** ${tc.expected_personas.join(", ")}  `,
      `**Actual panel:** ${run.panel.join(", ")}`,
      ""
    );

    if (run.planQuestions.length > 0) {
      lines.push("## Planner Decomposition");
      for (const q of run.planQuestions) {
        lines.push(`- **Q${q.id}:** ${q.summary} → [${q.personas.join(", ")}]`);
      }
      lines.push("");
    }

    lines.push("## Synthesised Response", "", run.synthesis, "");

    if (run.personaResponses.length > 0) {
      lines.push("## Individual Specialist Responses");
      for (const p of run.personaResponses) {
        lines.push("", `### ${p.role} (${p.persona_id})`, "", p.response);
      }
      lines.push("");
    }

    lines.push("## Assessment");

    if (assess.routing) {
      lines.push(
        "",
        `### Routing — ${score(assess.routing.score)}`,
        "",
        assess.routing.commentary
      );
      if (assess.routing.missed?.length)
        lines.push(`**Missed:** ${assess.routing.missed.join(", ")}`);
      if (assess.routing.unnecessary?.length)
        lines.push(`**Unnecessary:** ${assess.routing.unnecessary.join(", ")}`);
    }

    if (assess.persona_quality?.length) {
      lines.push("", "### Persona Quality");
      for (const p of assess.persona_quality) {
        lines.push("", `#### ${p.role} — ${score(p.score)}`, "", p.commentary);
      }
    }

    if (assess.synthesis) {
      lines.push(
        "",
        `### Synthesis — ${score(assess.synthesis.score)}`,
        "",
        assess.synthesis.commentary
      );
    }

    if (assess.overall) {
      lines.push("", "### Overall", "", assess.overall);
    }

    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eval-${roomSlug}-tc${tcNum}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Re-assess without re-running ───────────────────────────────────────────

  async function reAssess() {
    if (!activeRun || activeRun.status !== "done") return;
    const token = await getToken();
    setAuthToken(token);
    await runAssessment(
      activeTest,
      activeRun.panel,
      activeRun.planQuestions,
      activeRun.personaResponses,
      activeRun.synthesis,
      token
    );
  }

  // ── Run all ────────────────────────────────────────────────────────────────

  async function runAll() {
    for (const tc of TEST_CASES) {
      await runTest(tc);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col h-screen bg-zinc-50 text-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-zinc-200 shrink-0">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-base font-semibold tracking-tight">
              Roundtable Eval
            </h1>
            <p className="text-xs text-zinc-500">
              {activeRoom.name} · {TEST_CASES.length} test cases
            </p>
          </div>
          <button
            onClick={switchRoom}
            className="text-[10px] text-zinc-400 hover:text-zinc-700 underline ml-2"
          >
            Switch room
          </button>
        </div>
        <button
          onClick={runAll}
          className="px-3 py-1.5 text-xs font-medium bg-zinc-900 text-white rounded hover:bg-zinc-700 transition-colors"
        >
          Run All
        </button>
      </div>

      {/* Three-panel body */}
      <div className="flex flex-1 min-h-0">
        {/* ── Left: Test Library ── */}
        <div className="w-64 shrink-0 border-r border-zinc-200 bg-white flex flex-col">
          <div className="px-4 py-3 border-b border-zinc-100">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Test Library
            </p>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {TEST_CASES.map((tc) => {
              const run = runs[tc.id];
              const assess = assessments[tc.id];
              const isActive = tc.id === activeId;
              return (
                <button
                  key={tc.id}
                  onClick={() => setActiveId(tc.id)}
                  className={`w-full text-left px-4 py-3 border-b border-zinc-50 transition-colors ${
                    isActive ? "bg-zinc-100" : "hover:bg-zinc-50"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <StatusDot status={run?.status ?? "idle"} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-zinc-800 truncate">
                        {tc.label}
                      </p>
                      <p className="text-[10px] text-zinc-400 mt-0.5">
                        focus: {tc.eval_focus}
                      </p>
                    </div>
                    {assess?.status === "done" && assess.routing && (
                      <span className="text-[10px] font-semibold text-zinc-500">
                        {assess.routing.score}/5
                      </span>
                    )}
                  </div>
                  {(!run || run.status === "idle") && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        runTest(tc);
                      }}
                      className="mt-2 text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-white hover:bg-zinc-600 transition-colors"
                    >
                      Run
                    </button>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Centre: Live Run ── */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-zinc-200">
          <div className="px-5 py-3 border-b border-zinc-100 bg-white flex items-center justify-between shrink-0">
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Live Run
              </p>
              <p className="text-sm font-medium text-zinc-800 mt-0.5 truncate max-w-lg">
                {activeTest.label}
              </p>
            </div>
            {(!activeRun || activeRun.status === "idle") && (
              <button
                onClick={() => runTest(activeTest)}
                className="px-3 py-1.5 text-xs font-medium bg-zinc-900 text-white rounded hover:bg-zinc-700 transition-colors"
              >
                Run
              </button>
            )}
            {activeRun?.status === "running" && (
              <span className="text-xs text-blue-500 animate-pulse">
                Running…
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Question */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                Question
              </p>
              <p className="text-sm text-zinc-800 leading-relaxed">
                {activeTest.question}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                {activeTest.config_labels
                  ? activeTest.config_labels.map((cl) => (
                      <span key={cl.label} className="text-[10px] text-zinc-500">
                        {cl.label}: {cl.value}
                      </span>
                    ))
                  : <>
                      {activeTest.grip_stage && (
                        <span className="text-[10px] text-zinc-500">
                          {activeTest.grip_stage}
                        </span>
                      )}
                      {activeTest.contract_type && (
                        <span className="text-[10px] text-zinc-500">
                          {activeTest.contract_type}
                        </span>
                      )}
                    </>
                }
              </div>
              <div className="mt-1">
                <span className="text-[10px] text-zinc-400">
                  Expected: {activeTest.expected_personas.join(", ")}
                </span>
              </div>
            </div>

            {/* Stream log */}
            {activeRun && activeRun.streamLog.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                  Pipeline Events
                </p>
                <div className="bg-zinc-900 rounded p-3 font-mono text-[11px] text-zinc-300 space-y-0.5 max-h-48 overflow-y-auto">
                  {activeRun.streamLog.map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              </div>
            )}

            {/* Synthesis output */}
            {activeRun?.synthesis && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                  Synthesised Response
                  {activeRun.status === "running" && (
                    <span className="ml-2 text-blue-400 normal-case font-normal">
                      streaming…
                    </span>
                  )}
                </p>
                <div className="bg-white border border-zinc-200 rounded p-4 text-sm text-zinc-800 leading-relaxed whitespace-pre-wrap max-h-[32rem] overflow-y-auto">
                  {activeRun.synthesis}
                </div>
              </div>
            )}

            {/* Persona detail accordion */}
            {activeRun?.personaResponses && activeRun.personaResponses.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                  Individual Specialist Responses
                </p>
                <div className="space-y-2">
                  {activeRun.personaResponses.map((p) => (
                    <PersonaAccordion key={p.persona_id} persona={p} />
                  ))}
                </div>
              </div>
            )}

            {/* Error */}
            {activeRun?.status === "error" && (
              <div className="rounded bg-red-50 border border-red-200 p-3 text-xs text-red-700">
                {activeRun.error}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Assessment ── */}
        <div className="w-80 shrink-0 flex flex-col bg-white">
          <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between shrink-0">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Assessment
            </p>
            {activeRun?.status === "done" && (
              <div className="flex items-center gap-3">
                <button
                  onClick={reAssess}
                  className="text-[10px] text-zinc-500 hover:text-zinc-800 underline"
                >
                  Re-assess
                </button>
                {activeAssessment?.status === "done" && (
                  <button
                    onClick={() => downloadResult(activeId)}
                    className="text-[10px] px-2 py-1 rounded bg-zinc-800 text-white hover:bg-zinc-600 transition-colors"
                  >
                    ↓ Download
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {(!activeAssessment || activeAssessment.status === "idle") && (
              <p className="text-xs text-zinc-400">
                Run a test to generate an assessment.
              </p>
            )}

            {activeAssessment?.status === "assessing" && (
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse inline-block" />
                Assessing with Claude…
              </div>
            )}

            {activeAssessment?.status === "error" && (
              <div className="rounded bg-red-50 border border-red-200 p-3 text-xs text-red-700">
                {activeAssessment.error}
              </div>
            )}

            {activeAssessment?.status === "done" && (
              <div className="space-y-5">
                {/* Routing */}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                    Routing
                  </p>
                  <div className="flex items-center gap-2 mb-2">
                    {activeAssessment.routing && (
                      <ScoreBadge score={activeAssessment.routing.score} />
                    )}
                    <span className="text-xs text-zinc-600">/5 routing score</span>
                  </div>
                  <div className="text-xs text-zinc-500 mb-2 space-y-1">
                    <div>
                      <span className="text-zinc-400">Expected: </span>
                      {activeTest.expected_personas.join(", ")}
                    </div>
                    <div>
                      <span className="text-zinc-400">Actual: </span>
                      {activeRun?.panel.join(", ")}
                    </div>
                    {activeAssessment.routing?.missed?.length ? (
                      <div className="text-red-600">
                        Missed: {activeAssessment.routing.missed.join(", ")}
                      </div>
                    ) : null}
                    {activeAssessment.routing?.unnecessary?.length ? (
                      <div className="text-orange-600">
                        Unnecessary: {activeAssessment.routing.unnecessary.join(", ")}
                      </div>
                    ) : null}
                  </div>
                  {activeAssessment.routing && (
                    <p className="text-xs text-zinc-600 leading-relaxed">
                      {activeAssessment.routing.commentary}
                    </p>
                  )}
                </div>

                {/* Persona quality */}
                {activeAssessment.persona_quality && activeAssessment.persona_quality.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                      Persona Quality
                    </p>
                    <div className="space-y-3">
                      {activeAssessment.persona_quality.map((p) => (
                        <div key={p.persona_id}>
                          <div className="flex items-center gap-2 mb-1">
                            <ScoreBadge score={p.score} />
                            <span className="text-xs font-medium text-zinc-700">
                              {p.role}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-500 leading-relaxed">
                            {p.commentary}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Synthesis */}
                {activeAssessment.synthesis && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                      Synthesis
                    </p>
                    <div className="flex items-center gap-2 mb-2">
                      <ScoreBadge score={activeAssessment.synthesis.score} />
                      <span className="text-xs text-zinc-600">/5</span>
                    </div>
                    <p className="text-xs text-zinc-600 leading-relaxed">
                      {activeAssessment.synthesis.commentary}
                    </p>
                  </div>
                )}

                {/* Overall */}
                {activeAssessment.overall && (
                  <div className="pt-3 border-t border-zinc-100">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                      Overall
                    </p>
                    <p className="text-xs text-zinc-600 leading-relaxed">
                      {activeAssessment.overall}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PersonaAccordion
// ---------------------------------------------------------------------------

function PersonaAccordion({ persona }: { persona: PersonaCapture }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-zinc-200 rounded">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs text-left"
      >
        <span className="font-medium text-zinc-700">
          {persona.role}{" "}
          <span className="font-normal text-zinc-400">({persona.persona_id})</span>
        </span>
        <span className="text-zinc-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 text-xs text-zinc-600 leading-relaxed whitespace-pre-wrap border-t border-zinc-100 pt-2 max-h-64 overflow-y-auto">
          {persona.response}
        </div>
      )}
    </div>
  );
}
