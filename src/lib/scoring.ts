// Set scores, result line and concept status (docs/scoring-rules.md). Pure.
import { helpCategory, hintCap, type HelpCategory } from "./grading";

export type ScoredQuestion = {
  id: string;
  marks: number; // available
  hintLevel: number;
  aiQuestions: number;
  flags: string[];
  /** Confirmed marks, or null while waiting for the tutor. */
  confirmed: number | null;
  concepts: { key: string; label: string }[];
  /** False when the student left it blank: it scores 0 and counts as neither with nor without AI. */
  answered?: boolean;
};

export type QuestionScore = {
  id: string;
  category: HelpCategory | "no_answer";
  cap: number;
  confirmed: number | null;
  score: number | null; // confirmed × cap
};

export function scoreQuestion(q: ScoredQuestion): QuestionScore {
  const cap = hintCap(q.hintLevel);
  return {
    id: q.id,
    category: q.answered === false && q.hintLevel === 0 && q.aiQuestions === 0 ? "no_answer" : helpCategory(q.hintLevel, q.aiQuestions, q.flags),
    cap,
    confirmed: q.confirmed,
    score: q.confirmed === null ? null : Math.min(q.confirmed, q.marks) * cap,
  };
}

export type SetScore = {
  total: number;
  pending: number; // questions without confirmed marks
  marks: number; // Σ confirmed (uncapped), for the result line
  supported: number | null; // 0–1, null while pending
  independent: number | null;
  withoutAi: number;
  unverified: number;
  withAi: number;
  noAnswer: number;
  count: number;
  questions: QuestionScore[];
};

export function scoreSet(qs: ScoredQuestion[]): SetScore {
  const questions = qs.map(scoreQuestion);
  const total = qs.reduce((s, q) => s + q.marks, 0);
  const pending = questions.filter((q) => q.confirmed === null).length;
  const supportedMarks = questions.reduce((s, q) => s + (q.score ?? 0), 0);
  const independentMarks = questions.reduce(
    (s, q, i) => s + (q.category === "without_ai" ? Math.min(q.confirmed ?? 0, qs[i]!.marks) : 0),
    0,
  );
  return {
    total,
    pending,
    marks: questions.reduce((s, q, i) => s + Math.min(q.confirmed ?? 0, qs[i]!.marks), 0),
    supported: pending || !total ? null : supportedMarks / total,
    independent: pending || !total ? null : independentMarks / total,
    withoutAi: questions.filter((q) => q.category === "without_ai").length,
    unverified: questions.filter((q) => q.category === "unverified").length,
    withAi: questions.filter((q) => q.category === "with_ai").length,
    noAnswer: questions.filter((q) => q.category === "no_answer").length,
    count: qs.length,
    questions,
  };
}

export type ConceptStatus = "solid" | "shaky" | "needs";

export type ConceptRow = {
  key: string;
  label: string;
  status: ConceptStatus;
  available: number;
  got: number;
  lost: number;
  why: string;
};

/**
 * Status per concept over the given questions (the caller passes the last 3 sets or 10 questions):
 * Solid ≥ 80% all without AI; Needs work < 50% or marks lost again after help; otherwise Shaky.
 */
export function conceptStatus(qs: ScoredQuestion[], labels: (i: number) => string = (i) => `Q${i + 1}`): ConceptRow[] {
  const map = new Map<string, { label: string; items: { q: ScoredQuestion; s: QuestionScore; i: number }[] }>();
  qs.forEach((q, i) => {
    if (q.confirmed === null) return;
    const s = scoreQuestion(q);
    for (const c of q.concepts) {
      const e = map.get(c.key) ?? { label: c.label, items: [] };
      e.items.push({ q, s, i });
      map.set(c.key, e);
    }
  });
  const rows: ConceptRow[] = [];
  for (const [key, { label, items }] of map) {
    const available = items.reduce((n, x) => n + x.q.marks, 0);
    const got = items.reduce((n, x) => n + Math.min(x.q.confirmed ?? 0, x.q.marks), 0);
    const share = available ? got / available : 0;
    const helped = items.filter((x) => x.s.category === "with_ai");
    const lostAfterHelp = helped.filter((x) => (x.q.confirmed ?? 0) < x.q.marks);
    const allIndependent = items.every((x) => x.s.category === "without_ai");
    let status: ConceptStatus;
    let why: string;
    if (share < 0.5) {
      status = "needs";
      why = `${Math.round(share * 100)}% of marks`;
    } else if (lostAfterHelp.length > 0) {
      status = "needs";
      why = `Lost marks on ${lostAfterHelp.map((x) => labels(x.i)).join(" and ")} after help`;
    } else if (share >= 0.8 && allIndependent) {
      status = "solid";
      why = "No help";
    } else {
      status = "shaky";
      why = helped.length ? `Correct only with help on ${helped.map((x) => labels(x.i)).join(", ")}` : `${Math.round(share * 100)}% of marks`;
    }
    rows.push({ key, label, status, available, got, lost: available - got, why });
  }
  const order = { needs: 0, shaky: 1, solid: 2 };
  return rows.sort((a, b) => order[a.status] - order[b.status] || b.lost - a.lost);
}

/** Needs-work concept with most marks lost; else the first Shaky one. */
export function weakSpot(rows: ConceptRow[]): ConceptRow | null {
  const needs = rows.filter((r) => r.status === "needs").sort((a, b) => b.lost - a.lost);
  return needs[0] ?? rows.find((r) => r.status === "shaky") ?? null;
}

export const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);
