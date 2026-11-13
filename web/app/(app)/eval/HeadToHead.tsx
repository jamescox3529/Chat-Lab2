"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Arm = "roundtable" | "sonnet" | "opus";
const ARMS: Arm[] = ["roundtable", "sonnet", "opus"];
const ARM_LABEL: Record<Arm, string> = { roundtable: "Roundtable", sonnet: "Plain Sonnet", opus: "Plain Opus" };

type Criterion = "accuracy" | "depth" | "risks" | "actionability";
const CRITERIA: Criterion[] = ["accuracy", "depth", "risks", "actionability"];
const CRITERION_LABEL: Record<Criterion, string> = {
  accuracy: "Accuracy",
  depth: "Depth",
  risks: "Risks",
  actionability: "Action",
};

interface H2HQuestion {
  id: string;
  room_id: string;
  room_name: string;
  project_config: Record<string, string>;
  question: string;
}

interface UsageRow {
  stage: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
}

interface ArmResult {
  status: "running" | "done" | "error";
  error?: string;
  answer?: string;
  plan?: { id: string; summary: string; personas: string[] }[];
  panel?: string[];
  usage?: UsageRow[];
  input_tokens?: number;
  output_tokens?: number;
  latency_ms?: number;
}

interface SideScores {
  accuracy: number | null;
  depth: number | null;
  risks: number | null;
  actionability: number | null;
  errors: string[];
}

interface Judgement {
  status: "running" | "done" | "error";
  error?: string;
  answer_1?: SideScores;
  answer_2?: SideScores;
  verdict?: "answer_1" | "answer_2" | "tie";
  rationale?: string;
  truncated?: boolean;
  usage?: { model: string; input_tokens: number; output_tokens: number };
}

// Pair keys: first letter is answer_1, second is answer_2. A = Roundtable, B = Sonnet, C = Opus.
type PairKey = "AB" | "BA" | "AC" | "CA";
const PAIRS: PairKey[] = ["AB", "BA", "AC", "CA"];
const LETTER_ARM: Record<string, Arm> = { A: "roundtable", B: "sonnet", C: "opus" };

type Outcome = "W" | "L" | "T" | "P"; // P = position-sensitive (counts as a tie)
type Rival = "sonnet" | "opus";

interface SpotItem {
  qid: string;
  rival: Rival;
  order: [Arm, Arm]; // what is shown as Answer 1 / Answer 2
  pick?: "1" | "2" | "tie";
  revealed?: boolean;
}

// ---------------------------------------------------------------------------
// Pricing (list $ per million tokens) and helpers
// ---------------------------------------------------------------------------

function price(model: string): [number, number] {
  if (model.startsWith("claude-sonnet-5-5")) return [2, 10];
  if (model.startsWith("claude-opus-5-5")) return [4, 20];
  if (model.startsWith("claude-haiku-5-5")) return [0.1, 0.5];
  return [5, 25]; // Opus 4.x and anything unknown: price high rather than low
}

function costOf(rows: { model: string; input_tokens: number; output_tokens: number }[]): number {
  return rows.reduce((sum, r) => {
    const [i, o] = price(r.model);
    return sum + (r.input_tokens * i + r.output_tokens * o) / 1_000_000;
  }, 0);
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

function fmtTokens(n?: number): string {
  if (!n) return "–";
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/** A's result from one judgement, given whether A was answer_1. */
function aSide(j: Judgement | undefined, aFirst: boolean): "W" | "L" | "T" | null {
  if (!j || j.status !== "done" || !j.verdict) return null;
  if (j.verdict === "tie") return "T";
  const aWon = (j.verdict === "answer_1") === aFirst;
  return aWon ? "W" : "L";
}

/** Combined outcome for Roundtable vs rival: a win or loss only when both orders agree. */
function outcome(js: Record<string, Judgement> | undefined, rival: Rival): Outcome | null {
  const r = rival === "sonnet" ? "B" : "C";
  const first = aSide(js?.[`A${r}`], true);
  const second = aSide(js?.[`${r}A`], false);
  if (!first || !second) return null;
  if (first === second) return first;
  return "P";
}

/** Scores a given arm received across all judgements for a question. */
function armScores(js: Record<string, Judgement> | undefined, arm: Arm): SideScores[] {
  if (!js) return [];
  const out: SideScores[] = [];
  for (const key of PAIRS) {
    const j = js[key];
    if (!j || j.status !== "done") continue;
    if (LETTER_ARM[key[0]] === arm && j.answer_1) out.push(j.answer_1);
    if (LETTER_ARM[key[1]] === arm && j.answer_2) out.push(j.answer_2);
  }
  return out;
}

function mean(nums: (number | null | undefined)[]): number | null {
  const v = nums.filter((n): n is number => typeof n === "number");
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/** Roundtable minus rival, per criterion, from the two judgements that compare them. */
function deltas(js: Record<string, Judgement> | undefined, rival: Rival): Record<Criterion, number | null> {
  const r = rival === "sonnet" ? "B" : "C";
  const diffs: Record<Criterion, number[]> = { accuracy: [], depth: [], risks: [], actionability: [] };
  const ab = js?.[`A${r}`];
  const ba = js?.[`${r}A`];
  for (const c of CRITERIA) {
    if (ab?.status === "done" && ab.answer_1?.[c] != null && ab.answer_2?.[c] != null)
      diffs[c].push((ab.answer_1[c] as number) - (ab.answer_2[c] as number));
    if (ba?.status === "done" && ba.answer_2?.[c] != null && ba.answer_1?.[c] != null)
      diffs[c].push((ba.answer_2[c] as number) - (ba.answer_1[c] as number));
  }
  return {
    accuracy: mean(diffs.accuracy),
    depth: mean(diffs.depth),
    risks: mean(diffs.risks),
    actionability: mean(diffs.actionability),
  };
}

/**
 * Blind view only: remove wording that gives Roundtable away.
 * The stored answer is never changed.
 */
function neutralise(text: string): string {
  let t = text;
  t = t.replace(/\bThe panel's\b/g, "Our").replace(/\bthe panel's\b/g, "our");
  t = t.replace(/\bThe panel\b/g, "We").replace(/\bthe panel\b/g, "we");
  // Fix verb agreement after the swap ("we agrees" -> "we agree").
  t = t.replace(
    /\b([Ww]e) (agrees|recommends|considers|believes|notes|suggests|sees|thinks|regards|views|favours|prefers|advises|splits|leans|takes|flags|warns|accepts|disagrees|divides|is|has|was)\b/g,
    (_m, w: string, v: string) => {
      const base: Record<string, string> = { is: "are", has: "have", was: "were" };
      return `${w} ${base[v] ?? v.replace(/s$/, "")}`;
    },
  );
  // "Specialists agree that ..." style attributions.
  t = t.replace(
    /\b(?:the |our |all |both )?(?:specialists|experts|advisers|advisors|panellists|panel members)(?: all| broadly| unanimously| largely)? (?:agree|agreed|concur|concurred|are aligned|were aligned)(?: that| on this)?[,:]?\s*/gi,
    "",
  );
  // "One specialist cited ...", "the signalling specialists lean ..." -> "practitioner(s)".
  // Applied to both answers in a pair, so it stays neutral.
  t = t.replace(/\b([Ss])pecialist(s?)\b/g, (_m, s: string, pl: string) => (s === "S" ? "P" : "p") + "ractitioner" + pl);
  // Re-capitalise sentence starts that the strip above may have lowered.
  t = t.replace(/(^|[.!?]\s+|\n\s*)([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());
  return t;
}

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const OUTCOME_STYLE: Record<Outcome, string> = {
  W: "bg-emerald-100 text-emerald-800",
  L: "bg-red-100 text-red-800",
  T: "bg-zinc-100 text-zinc-700",
  P: "bg-amber-100 text-amber-800",
};
const OUTCOME_TITLE: Record<Outcome, string> = {
  W: "Roundtable wins (both orders agree)",
  L: "Roundtable loses (both orders agree)",
  T: "Tie",
  P: "Position-sensitive: the two orders disagreed (counts as a tie)",
};

function OutcomeBadge({ o }: { o: Outcome | null }) {
  if (!o) return <span className="text-zinc-300">–</span>;
  return (
    <span title={OUTCOME_TITLE[o]} className={`inline-block w-6 text-center rounded text-[11px] font-semibold ${OUTCOME_STYLE[o]}`}>
      {o}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HeadToHead({ apiBase }: { apiBase: string }) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [questions, setQuestions] = useState<H2HQuestion[]>([]);
  const [loadError, setLoadError] = useState<string>("");
  const [answers, setAnswers] = useState<Record<string, Partial<Record<Arm, ArmResult>>>>({});
  const [judgements, setJudgements] = useState<Record<string, Record<string, Judgement>>>({});
  const [running, setRunning] = useState(false);
  const [selected, setSelected] = useState<string>("");
  const [spot, setSpot] = useState<SpotItem[] | null>(null);

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await getToken();
    const res = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => res.statusText)}`);
    return res.json();
  }

  // Wait for Clerk: fetching before it has a token returns 401.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    api<{ questions: H2HQuestion[] }>("/api/eval/h2h/questions")
      .then((d) => {
        setLoadError("");
        setQuestions(d.questions);
        if (d.questions.length) setSelected((s) => s || d.questions[0].id);
      })
      .catch((e) => setLoadError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);

  // ── Running ───────────────────────────────────────────────────────────────

  async function runArm(qid: string, arm: Arm): Promise<ArmResult> {
    setAnswers((p) => ({ ...p, [qid]: { ...p[qid], [arm]: { status: "running" } } }));
    try {
      const data = await api<Omit<ArmResult, "status">>("/api/eval/h2h/answer", {
        method: "POST",
        body: JSON.stringify({ question_id: qid, arm }),
      });
      const r: ArmResult = { status: "done", ...data };
      setAnswers((p) => ({ ...p, [qid]: { ...p[qid], [arm]: r } }));
      return r;
    } catch (e) {
      const r: ArmResult = { status: "error", error: e instanceof Error ? e.message : String(e) };
      setAnswers((p) => ({ ...p, [qid]: { ...p[qid], [arm]: r } }));
      return r;
    }
  }

  async function runJudge(qid: string, key: PairKey, a1: string, a2: string): Promise<void> {
    setJudgements((p) => ({ ...p, [qid]: { ...p[qid], [key]: { status: "running" } } }));
    try {
      const data = await api<Omit<Judgement, "status">>("/api/eval/h2h/judge", {
        method: "POST",
        body: JSON.stringify({ question_id: qid, answer_1: a1, answer_2: a2 }),
      });
      setJudgements((p) => ({ ...p, [qid]: { ...p[qid], [key]: { status: "done", ...data } } }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setJudgements((p) => ({ ...p, [qid]: { ...p[qid], [key]: { status: "error", error: msg } } }));
    }
  }

  async function runQuestion(qid: string) {
    setJudgements((p) => ({ ...p, [qid]: {} }));
    const results = await Promise.all(ARMS.map((arm) => runArm(qid, arm)));
    const byArm = Object.fromEntries(ARMS.map((a, i) => [a, results[i]])) as Record<Arm, ArmResult>;
    const text = (arm: Arm) => byArm[arm].answer ?? "";
    const jobs: Promise<void>[] = [];
    if (byArm.roundtable.status === "done" && byArm.sonnet.status === "done") {
      jobs.push(runJudge(qid, "AB", text("roundtable"), text("sonnet")));
      jobs.push(runJudge(qid, "BA", text("sonnet"), text("roundtable")));
    }
    if (byArm.roundtable.status === "done" && byArm.opus.status === "done") {
      jobs.push(runJudge(qid, "AC", text("roundtable"), text("opus")));
      jobs.push(runJudge(qid, "CA", text("opus"), text("roundtable")));
    }
    await Promise.all(jobs);
  }

  async function runOne(qid: string) {
    if (running) return;
    setRunning(true);
    setSelected(qid);
    try {
      await runQuestion(qid);
    } finally {
      setRunning(false);
    }
  }

  async function runAll() {
    if (running || !questions.length) return;
    const ok = confirm(
      `Run all ${questions.length} questions?\n\n` +
        `Each question makes 3 answer calls and 4 Opus judge calls. ` +
        `Expect roughly $7 in API cost for the full run (about $0.70 per question), and 15–20 minutes.`,
    );
    if (!ok) return;
    setRunning(true);
    setSpot(null);
    try {
      for (const q of questions) {
        setSelected(q.id);
        await runQuestion(q.id);
      }
    } finally {
      setRunning(false);
    }
  }

  // ── Derived numbers ───────────────────────────────────────────────────────

  const totals = useMemo(() => {
    const usage: { model: string; input_tokens: number; output_tokens: number }[] = [];
    const armTokens: Record<Arm, { in: number; out: number; cost: number }> = {
      roundtable: { in: 0, out: 0, cost: 0 },
      sonnet: { in: 0, out: 0, cost: 0 },
      opus: { in: 0, out: 0, cost: 0 },
    };
    for (const qa of Object.values(answers)) {
      for (const arm of ARMS) {
        const r = qa?.[arm];
        if (r?.status !== "done" || !r.usage) continue;
        usage.push(...r.usage);
        armTokens[arm].in += r.input_tokens ?? 0;
        armTokens[arm].out += r.output_tokens ?? 0;
        armTokens[arm].cost += costOf(r.usage);
      }
    }
    let judgeCost = 0;
    let judgeTruncated = 0;
    for (const js of Object.values(judgements)) {
      for (const j of Object.values(js ?? {})) {
        if (j.status === "done" && j.usage) {
          usage.push(j.usage);
          judgeCost += costOf([j.usage]);
          if (j.truncated) judgeTruncated += 1;
        }
      }
    }
    const tally = (rival: Rival) => {
      const t = { W: 0, T: 0, L: 0, P: 0 };
      for (const q of questions) {
        const o = outcome(judgements[q.id], rival);
        if (o) t[o] += 1;
      }
      return t;
    };
    const meanDeltas = (rival: Rival) => {
      const out = {} as Record<Criterion, number | null>;
      for (const c of CRITERIA) out[c] = mean(questions.map((q) => deltas(judgements[q.id], rival)[c]));
      return out;
    };
    return {
      cost: costOf(usage),
      armTokens,
      judgeCost,
      judgeTruncated,
      vsSonnet: tally("sonnet"),
      vsOpus: tally("opus"),
      dSonnet: meanDeltas("sonnet"),
      dOpus: meanDeltas("opus"),
    };
  }, [answers, judgements, questions]);

  const complete = questions.filter(
    (q) => outcome(judgements[q.id], "sonnet") !== null || outcome(judgements[q.id], "opus") !== null,
  );

  // ── Spot-check ────────────────────────────────────────────────────────────

  function startSpotCheck() {
    const combos: { qid: string; rival: Rival }[] = [];
    for (const q of questions) {
      for (const rival of ["sonnet", "opus"] as Rival[]) {
        if (outcome(judgements[q.id], rival) !== null) combos.push({ qid: q.id, rival });
      }
    }
    if (!combos.length) {
      alert("Run at least one question first.");
      return;
    }
    setSpot(
      shuffle(combos)
        .slice(0, 3)
        .map((c) => ({
          ...c,
          order: (Math.random() < 0.5 ? ["roundtable", c.rival] : [c.rival, "roundtable"]) as [Arm, Arm],
        })),
    );
  }

  function pickSpot(i: number, pick: "1" | "2" | "tie") {
    setSpot((s) => s && s.map((it, k) => (k === i ? { ...it, pick } : it)));
  }

  function revealSpot(i: number) {
    setSpot((s) => s && s.map((it, k) => (k === i ? { ...it, revealed: true } : it)));
  }

  /** James's pick and the judge's combined verdict, both as the winning arm (or "tie"). */
  function spotAgreement(it: SpotItem): { james: Arm | "tie"; judge: Arm | "tie"; agree: boolean } | null {
    if (!it.pick) return null;
    const james: Arm | "tie" = it.pick === "tie" ? "tie" : it.order[it.pick === "1" ? 0 : 1];
    const o = outcome(judgements[it.qid], it.rival);
    const judge: Arm | "tie" = o === "W" ? "roundtable" : o === "L" ? it.rival : "tie";
    return { james, judge, agree: james === judge };
  }

  const agreement = (() => {
    const done = (spot ?? []).filter((it) => it.revealed && it.pick);
    const agreed = done.filter((it) => spotAgreement(it)?.agree).length;
    return { done: done.length, agreed };
  })();

  // ── Downloads ─────────────────────────────────────────────────────────────

  function download(name: string, body: string, type: string) {
    const url = URL.createObjectURL(new Blob([body], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadJson() {
    const payload = {
      generated_at: new Date().toISOString(),
      questions,
      answers,
      judgements,
      outcomes: Object.fromEntries(
        questions.map((q) => [q.id, { vs_sonnet: outcome(judgements[q.id], "sonnet"), vs_opus: outcome(judgements[q.id], "opus") }]),
      ),
      summary: totals,
      spot_check: spot,
    };
    download(`h2h-${Date.now()}.json`, JSON.stringify(payload, null, 2), "application/json");
  }

  function downloadMarkdown() {
    const f = (n: number | null) => (n == null ? "–" : (n >= 0 ? "+" : "") + n.toFixed(2));
    const L: string[] = [];
    L.push(`# Head-to-head eval — ${new Date().toLocaleString("en-GB")}`, "");
    L.push(`Roundtable vs plain Sonnet 5.5 and plain Opus 5.5, judged blind by Opus 5.5, each pair judged in both orders.`, "");
    L.push(`## Summary`, "");
    for (const [label, t, d] of [
      ["vs Sonnet", totals.vsSonnet, totals.dSonnet],
      ["vs Opus", totals.vsOpus, totals.dOpus],
    ] as const) {
      L.push(
        `- **Roundtable ${label}:** ${t.W} wins, ${t.T + t.P} ties (${t.P} position-sensitive), ${t.L} losses. ` +
          `Mean score delta: ${CRITERIA.map((c) => `${CRITERION_LABEL[c]} ${f(d[c])}`).join(", ")}`,
      );
    }
    L.push(`- **Estimated cost:** ${money(totals.cost)} (judge ${money(totals.judgeCost)})`);
    L.push(`- **Judge calls truncated:** ${totals.judgeTruncated}`);
    if (agreement.done) L.push(`- **Spot-check agreement with judge:** ${agreement.agreed}/${agreement.done}`);
    L.push("", `## Per question`, "", `| Question | Room | vs Sonnet | vs Opus |`, `|---|---|---|---|`);
    for (const q of questions) {
      L.push(`| ${q.id} | ${q.room_name} | ${outcome(judgements[q.id], "sonnet") ?? "–"} | ${outcome(judgements[q.id], "opus") ?? "–"} |`);
    }
    L.push("", "W/L = both orders agree. P = position-sensitive (orders disagreed), counted as a tie.");
    for (const q of questions) {
      const js = judgements[q.id];
      if (!js) continue;
      L.push("", `### ${q.id} — ${q.room_name}`, "", q.question, "");
      for (const key of PAIRS) {
        const j = js[key];
        if (!j || j.status !== "done") continue;
        const a1 = ARM_LABEL[LETTER_ARM[key[0]]];
        const a2 = ARM_LABEL[LETTER_ARM[key[1]]];
        const winner = j.verdict === "answer_1" ? a1 : j.verdict === "answer_2" ? a2 : "Tie";
        L.push(`**${a1} (1) vs ${a2} (2): ${winner}**`, "", j.rationale ?? "", "");
        for (const [side, label] of [["answer_1", a1], ["answer_2", a2]] as const) {
          const s = j[side];
          if (s?.errors?.length) L.push(`Errors flagged in ${label}: ${s.errors.join("; ")}`, "");
        }
      }
    }
    download(`h2h-${Date.now()}.md`, L.join("\n"), "text/markdown");
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loadError) {
    return <div className="p-6 text-sm text-red-700">Couldn&apos;t load head-to-head questions: {loadError}</div>;
  }

  const selQ = questions.find((q) => q.id === selected);
  const avg = (qid: string, arm: Arm, c: Criterion) => mean(armScores(judgements[qid], arm).map((s) => s[c]));

  return (
    <div className="flex flex-col h-full bg-zinc-50 text-zinc-900">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 bg-white border-b border-zinc-200 shrink-0">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight">Head-to-head</h2>
          <p className="text-xs text-zinc-500">
            Roundtable vs plain Sonnet 5.5 and plain Opus 5.5 · {questions.length} questions · judged blind by Opus 5.5, both orders
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 whitespace-nowrap">
          <span className="text-xs text-zinc-500 mr-2" title="Estimated from token usage at list prices">
            Spent so far: <span className="font-medium text-zinc-800">{money(totals.cost)}</span>
          </span>
          <button
            onClick={startSpotCheck}
            disabled={running || !complete.length}
            className="px-3 py-1.5 text-xs font-medium bg-zinc-100 text-zinc-700 rounded hover:bg-zinc-200 disabled:opacity-40"
          >
            Blind spot-check
          </button>
          <button
            onClick={downloadMarkdown}
            disabled={!complete.length}
            className="px-3 py-1.5 text-xs font-medium bg-zinc-100 text-zinc-700 rounded hover:bg-zinc-200 disabled:opacity-40"
          >
            Download .md
          </button>
          <button
            onClick={downloadJson}
            disabled={!complete.length}
            className="px-3 py-1.5 text-xs font-medium bg-zinc-100 text-zinc-700 rounded hover:bg-zinc-200 disabled:opacity-40"
          >
            Download JSON
          </button>
          <button
            onClick={runAll}
            disabled={running || !questions.length}
            className="px-3 py-1.5 text-xs font-medium bg-zinc-900 text-white rounded hover:bg-zinc-700 disabled:opacity-40"
          >
            {running ? "Running…" : "Run all"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Blind spot-check */}
        {spot && (
          <section className="bg-white border border-zinc-200 rounded p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Blind spot-check</h3>
                <p className="text-xs text-zinc-500">
                  Pick the better answer, then reveal. Wording that names &quot;the panel&quot; is neutralised in this view only.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-600">
                  Agreement with judge: <span className="font-semibold">{agreement.agreed}/{agreement.done}</span>
                </span>
                <button onClick={() => setSpot(null)} className="text-[10px] text-zinc-400 hover:text-zinc-700 underline">
                  Close
                </button>
              </div>
            </div>
            {spot.map((it, i) => {
              const q = questions.find((x) => x.id === it.qid)!;
              const qa = answers[it.qid] ?? {};
              const ag = it.revealed ? spotAgreement(it) : null;
              const o = outcome(judgements[it.qid], it.rival);
              return (
                <div key={`${it.qid}-${it.rival}-${i}`} className="border border-zinc-200 rounded">
                  <div className="px-3 py-2 border-b border-zinc-100 bg-zinc-50">
                    <p className="text-[10px] uppercase tracking-wider text-zinc-400">
                      {i + 1} of {spot.length} · {q.room_name}
                    </p>
                    <p className="text-sm text-zinc-800 mt-1">{q.question}</p>
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-zinc-100">
                    {it.order.map((arm, k) => (
                      <div key={k} className="p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                          Answer {k + 1}
                          {it.revealed && <span className="ml-2 normal-case text-zinc-700">= {ARM_LABEL[arm]}</span>}
                        </p>
                        <div className="text-sm text-zinc-800 leading-relaxed whitespace-pre-wrap max-h-[28rem] overflow-y-auto">
                          {neutralise(qa[arm]?.answer ?? "")}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="px-3 py-2 border-t border-zinc-100 flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-zinc-500 mr-1">Better:</span>
                    {(["1", "2", "tie"] as const).map((p) => (
                      <button
                        key={p}
                        disabled={it.revealed}
                        onClick={() => pickSpot(i, p)}
                        className={`px-2.5 py-1 text-xs rounded border ${
                          it.pick === p ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-100"
                        } disabled:cursor-default`}
                      >
                        {p === "tie" ? "Tie" : `Answer ${p}`}
                      </button>
                    ))}
                    <button
                      disabled={!it.pick || it.revealed}
                      onClick={() => revealSpot(i)}
                      className="ml-2 px-2.5 py-1 text-xs rounded bg-zinc-100 text-zinc-700 hover:bg-zinc-200 disabled:opacity-40"
                    >
                      Reveal
                    </button>
                    {ag && (
                      <span className="text-xs text-zinc-600 ml-2">
                        You: <b>{ag.james === "tie" ? "Tie" : ARM_LABEL[ag.james]}</b> · Judge:{" "}
                        <b>{ag.judge === "tie" ? "Tie" : ARM_LABEL[ag.judge]}</b>
                        {o === "P" && " (position-sensitive)"} ·{" "}
                        <span className={ag.agree ? "text-emerald-700" : "text-red-700"}>{ag.agree ? "agree" : "disagree"}</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* Results table */}
        <section className="bg-white border border-zinc-200 rounded overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                <th className="text-left font-medium px-3 py-2" rowSpan={2}>Question</th>
                <th className="text-left font-medium px-3 py-2" rowSpan={2}>Progress</th>
                <th className="font-medium px-2 py-2" rowSpan={2} title="Roundtable vs plain Sonnet">vs Sonnet</th>
                <th className="font-medium px-2 py-2" rowSpan={2} title="Roundtable vs plain Opus">vs Opus</th>
                {CRITERIA.map((c) => (
                  <th key={c} className="font-medium px-2 py-1 border-l border-zinc-200" colSpan={3}>
                    {CRITERION_LABEL[c]}
                  </th>
                ))}
                <th className="font-medium px-2 py-1 border-l border-zinc-200" colSpan={3}>Output tokens</th>
                <th className="text-left font-medium px-3 py-2" rowSpan={2}></th>
              </tr>
              <tr>
                {[...CRITERIA, "tokens"].map((c) =>
                  (["R", "S", "O"] as const).map((l, k) => (
                    <th key={`${c}-${l}`} className={`font-normal px-1.5 pb-1 text-[10px] ${k === 0 ? "border-l border-zinc-200" : ""}`}>
                      {l}
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody>
              {questions.map((q) => {
                const qa = answers[q.id] ?? {};
                const js = judgements[q.id] ?? {};
                const judgeDone = PAIRS.filter((k) => js[k]?.status === "done").length;
                const judgeRunning = PAIRS.some((k) => js[k]?.status === "running");
                const err = [...ARMS.map((a) => qa[a]?.error), ...PAIRS.map((k) => js[k]?.error)].filter(Boolean);
                return (
                  <tr
                    key={q.id}
                    onClick={() => setSelected(q.id)}
                    className={`border-t border-zinc-100 cursor-pointer ${selected === q.id ? "bg-zinc-50" : "hover:bg-zinc-50"}`}
                  >
                    <td className="px-3 py-2 align-top">
                      <p className="font-medium text-zinc-800">{q.id}</p>
                      <p className="text-[10px] text-zinc-400">{q.room_name}</p>
                    </td>
                    <td className="px-3 py-2 align-top whitespace-nowrap">
                      <div className="flex gap-1">
                        {ARMS.map((a) => {
                          const s = qa[a]?.status;
                          const cls =
                            s === "done" ? "bg-emerald-500" : s === "running" ? "bg-amber-400 animate-pulse" : s === "error" ? "bg-red-500" : "bg-zinc-200";
                          return <span key={a} title={`${ARM_LABEL[a]}: ${s ?? "not run"}`} className={`w-2 h-2 rounded-full ${cls}`} />;
                        })}
                        <span className="text-[10px] text-zinc-400 ml-1">
                          judge {judgeDone}/4{judgeRunning ? "…" : ""}
                        </span>
                      </div>
                      {err.length > 0 && <p className="text-[10px] text-red-600 mt-1 max-w-[12rem] truncate" title={err.join("\n")}>{err[0]}</p>}
                    </td>
                    <td className="px-2 py-2 text-center align-top"><OutcomeBadge o={outcome(js, "sonnet")} /></td>
                    <td className="px-2 py-2 text-center align-top"><OutcomeBadge o={outcome(js, "opus")} /></td>
                    {CRITERIA.map((c) =>
                      ARMS.map((a, k) => {
                        const v = avg(q.id, a, c);
                        return (
                          <td key={`${c}-${a}`} className={`px-1.5 py-2 text-center align-top tabular-nums ${k === 0 ? "border-l border-zinc-100 font-medium" : "text-zinc-500"}`}>
                            {v == null ? "–" : v.toFixed(1)}
                          </td>
                        );
                      }),
                    )}
                    {ARMS.map((a, k) => (
                      <td key={`tok-${a}`} className={`px-1.5 py-2 text-center align-top tabular-nums text-zinc-500 ${k === 0 ? "border-l border-zinc-100" : ""}`}>
                        {fmtTokens(qa[a]?.output_tokens)}
                      </td>
                    ))}
                    <td className="px-3 py-2 align-top">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          runOne(q.id);
                        }}
                        disabled={running}
                        className="text-[10px] text-zinc-500 hover:text-zinc-800 underline disabled:opacity-40"
                      >
                        Run
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-zinc-50 border-t border-zinc-200">
              <tr>
                <td className="px-3 py-2 font-medium" colSpan={2}>
                  Summary
                  <p className="text-[10px] font-normal text-zinc-400">W–T–L (P = position-sensitive, counted as T)</p>
                </td>
                {(["vsSonnet", "vsOpus"] as const).map((k) => {
                  const t = totals[k];
                  return (
                    <td key={k} className="px-2 py-2 text-center whitespace-nowrap tabular-nums">
                      {t.W}–{t.T + t.P}–{t.L}
                      {t.P > 0 && <span className="block text-[10px] text-amber-700">{t.P} P</span>}
                    </td>
                  );
                })}
                {CRITERIA.map((c) => (
                  <td key={c} className="px-1.5 py-2 text-center border-l border-zinc-200 text-[10px] leading-tight" colSpan={3}>
                    {(["dSonnet", "dOpus"] as const).map((k) => {
                      const v = totals[k][c];
                      const cls = v == null ? "text-zinc-400" : v > 0.05 ? "text-emerald-700" : v < -0.05 ? "text-red-700" : "text-zinc-600";
                      return (
                        <span key={k} className={`block ${cls}`}>
                          R−{k === "dSonnet" ? "S" : "O"} {v == null ? "–" : (v >= 0 ? "+" : "") + v.toFixed(2)}
                        </span>
                      );
                    })}
                  </td>
                ))}
                <td className="px-1.5 py-2 text-center border-l border-zinc-200 text-[10px] leading-tight" colSpan={3}>
                  {ARMS.map((a) => (
                    <span key={a} className="block">
                      {ARM_LABEL[a]}: {money(totals.armTokens[a].cost)}
                    </span>
                  ))}
                  <span className="block">Judge: {money(totals.judgeCost)}</span>
                  <span className="block font-semibold">Total: {money(totals.cost)}</span>
                </td>
                <td className="px-3 py-2 text-[10px] text-zinc-500">
                  {totals.judgeTruncated > 0 && <span className="text-red-700">{totals.judgeTruncated} judge truncated</span>}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>

        {/* Detail */}
        {selQ && (
          <section className="space-y-4">
            <div className="bg-white border border-zinc-200 rounded p-4">
              <p className="text-[10px] uppercase tracking-wider text-zinc-400">
                {selQ.id} · {selQ.room_name}
              </p>
              <p className="text-sm text-zinc-800 mt-1">{selQ.question}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                {Object.entries(selQ.project_config)
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <span key={k} className="text-[10px] text-zinc-500">
                      {k}: <span className="text-zinc-700">{v}</span>
                    </span>
                  ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {ARMS.map((arm) => {
                const r = answers[selQ.id]?.[arm];
                return (
                  <div key={arm} className="bg-white border border-zinc-200 rounded flex flex-col min-w-0">
                    <div className="px-3 py-2 border-b border-zinc-100">
                      <p className="text-xs font-semibold text-zinc-800">{ARM_LABEL[arm]}</p>
                      {r?.status === "done" && (
                        <p className="text-[10px] text-zinc-400">
                          {fmtTokens(r.input_tokens)} in · {fmtTokens(r.output_tokens)} out · {((r.latency_ms ?? 0) / 1000).toFixed(0)}s ·{" "}
                          {money(costOf(r.usage ?? []))}
                        </p>
                      )}
                      {arm === "roundtable" && r?.panel && r.panel.length > 0 && (
                        <p className="text-[10px] text-zinc-500 mt-1">Panel: {r.panel.join(", ")}</p>
                      )}
                      {arm === "roundtable" && r?.plan && r.plan.length > 1 && (
                        <div className="mt-1 space-y-0.5">
                          {r.plan.map((p) => (
                            <p key={p.id} className="text-[10px] text-zinc-400">
                              {p.id}: {p.summary} → {p.personas.join(", ")}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="p-3 text-sm text-zinc-800 leading-relaxed whitespace-pre-wrap max-h-[36rem] overflow-y-auto">
                      {r?.status === "running" && <span className="text-zinc-400">Generating…</span>}
                      {r?.status === "error" && <span className="text-red-700">{r.error}</span>}
                      {r?.status === "done" && r.answer}
                      {!r && <span className="text-zinc-400">Not run yet.</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {PAIRS.map((key) => {
                const j = judgements[selQ.id]?.[key];
                const a1 = ARM_LABEL[LETTER_ARM[key[0]]];
                const a2 = ARM_LABEL[LETTER_ARM[key[1]]];
                const winner = j?.verdict === "answer_1" ? a1 : j?.verdict === "answer_2" ? a2 : j?.verdict === "tie" ? "Tie" : "";
                return (
                  <div key={key} className="bg-white border border-zinc-200 rounded p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-zinc-800">
                        1: {a1} · 2: {a2}
                      </p>
                      {winner && <span className="text-xs text-zinc-600">Verdict: <b>{winner}</b></span>}
                    </div>
                    {j?.status === "running" && <p className="text-xs text-zinc-400 mt-2">Judging…</p>}
                    {j?.status === "error" && <p className="text-xs text-red-700 mt-2">{j.error}</p>}
                    {!j && <p className="text-xs text-zinc-400 mt-2">Not judged yet.</p>}
                    {j?.status === "done" && (
                      <>
                        <table className="text-[11px] mt-2">
                          <thead>
                            <tr className="text-zinc-400">
                              <th className="text-left font-normal pr-3"></th>
                              {CRITERIA.map((c) => (
                                <th key={c} className="font-normal px-2">{CRITERION_LABEL[c]}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(["answer_1", "answer_2"] as const).map((side, k) => (
                              <tr key={side}>
                                <td className="pr-3 text-zinc-600">{k === 0 ? a1 : a2}</td>
                                {CRITERIA.map((c) => (
                                  <td key={c} className="px-2 text-center tabular-nums">{j[side]?.[c] ?? "–"}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <p className="text-xs text-zinc-700 leading-relaxed mt-2">{j.rationale}</p>
                        {(["answer_1", "answer_2"] as const).map((side, k) =>
                          j[side]?.errors?.length ? (
                            <div key={side} className="mt-2">
                              <p className="text-[10px] font-semibold text-red-700">Errors flagged in {k === 0 ? a1 : a2}</p>
                              <ul className="list-disc pl-4 text-[11px] text-zinc-700">
                                {j[side]!.errors.map((e, n) => (
                                  <li key={n}>{e}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null,
                        )}
                        {j.truncated && <p className="text-[10px] text-red-700 mt-2">Judge output hit max_tokens.</p>}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
