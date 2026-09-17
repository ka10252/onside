import "server-only";
import { randomBytes } from "node:crypto";
import { isPast, pastContext, tableBlock, type Block, type Format, type Question } from "./content";
import { db, json } from "./db";
import { queueMarking } from "./ai/marking";
import { hasAnswer } from "./answered";
import { checkCalculation, HELPER_LOCK_MS, scoreChain } from "./grading";

export { hasAnswer, hasAnswerSql } from "./answered";

export type AssignmentInfo = {
  id: string;
  set_id: string;
  student_id: string;
  status: "not_started" | "in_progress" | "submitted" | "reviewed";
  due_at: string | null;
  started_at: string | null;
  submitted_at: string | null;
  title: string;
  helper: "on" | "off";
  time_limit_min: number | null;
};

export function getAssignment(id: string, studentId: string): AssignmentInfo | null {
  closeExpiredAssignments();
  return (
    (db()
      .prepare(
        `SELECT a.id, a.set_id, a.student_id, a.status, a.due_at, a.started_at, a.submitted_at,
                s.title, s.helper, s.time_limit_min
           FROM assignments a JOIN sets s ON s.id = a.set_id
          WHERE a.id = ? AND a.student_id = ?`,
      )
      .get(id, studentId) as AssignmentInfo | undefined) ?? null
  );
}

export function setQuestions(setId: string): Question[] {
  return (
    db()
      .prepare(
        "SELECT q.data FROM set_items i JOIN questions q ON q.id = i.question_id WHERE i.set_id = ? ORDER BY i.position",
      )
      .all(setId) as { data: string }[]
  ).map((r) => JSON.parse(r.data) as Question);
}

export function hintsFor(q: Question): [string, string] | null {
  if (q.hints && q.hints[0] && q.hints[1]) return q.hints;
  return null;
}

/** Deadline for timed sets (ms), or null. */
export function deadline(a: AssignmentInfo): number | null {
  if (a.helper !== "off" || !a.time_limit_min || !a.started_at) return null;
  return new Date(a.started_at).getTime() + a.time_limit_min * 60_000;
}

/** Late saves (the final flush when time runs out) are accepted for this long after the deadline. */
export const GRACE_MS = 30_000;

export function isLocked(a: AssignmentInfo, graceMs = 0): boolean {
  if (a.status === "submitted" || a.status === "reviewed") return true;
  const end = deadline(a);
  return end !== null && Date.now() > end + graceMs;
}

/** Marks an auto-marked answer once, when the set is submitted. Null for written questions. */
export function gradeAuto(q: Question, answers: string[]): { value: string; correct: boolean; marks: number | null; misconception: string | null } | null {
  if (isPast(q)) return null;
  if (q.format === "mcq") {
    const value = answers[0] ?? "";
    const correct = value === q.answer;
    const misconception = correct ? null : (q.options.find((o) => o.id === value)?.misconception ?? null);
    return { value, correct, marks: correct ? q.marks : 0, misconception };
  }
  if (q.format === "calculation") {
    const parts = "parts" in q.answer ? q.answer.parts : [{ label: "", ...q.answer }];
    // Final values are auto-checked; working marks are suggested by AI and confirmed by the tutor.
    return { value: answers.join(" | "), correct: checkCalculation(parts, answers).correct, marks: null, misconception: null };
  }
  if (q.format === "analysis_chain") {
    const res = scoreChain(q.answer, answers, q.marks);
    return { value: answers.join(","), correct: res.correct, marks: res.marks, misconception: null };
  }
  return null;
}

/**
 * Submits an assignment: every answered question is submitted as it is, auto-marked formats are
 * checked once, then AI marking starts. Used by the student's Submit button and when a timed set runs out.
 */
export function finalizeAssignment(assignmentId: string) {
  const now = new Date().toISOString();
  const changed = db().transaction(() => {
    const rows = db()
      .prepare(
        `SELECT r.*, q.data AS qdata FROM responses r JOIN questions q ON q.id = r.question_id
          WHERE r.assignment_id = ? AND r.submitted_at IS NULL`,
      )
      .all(assignmentId) as (ResponseRow & { qdata: string })[];
    const setAuto = db().prepare("UPDATE responses SET attempts = ?, auto_correct = ?, auto_marks = ? WHERE id = ?");
    const submit = db().prepare("UPDATE responses SET submitted_at = ? WHERE id = ?");
    const event = db().prepare("INSERT INTO events (response_id, type, data) VALUES (?, ?, ?)");
    for (const r of rows) {
      if (!hasAnswer(r)) continue;
      const q = JSON.parse(r.qdata) as Question;
      const answers = json.parse<string[]>(r.answers, []);
      const g = answers.length ? gradeAuto(q, answers) : null;
      if (g) {
        setAuto.run(JSON.stringify([{ value: g.value, at: now, correct: g.correct }]), g.correct ? 1 : 0, g.marks, r.id);
        event.run(r.id, "attempt", JSON.stringify({ value: g.value, correct: g.correct, n: 1, ...(g.misconception ? { misconception: g.misconception } : {}) }));
      }
      submit.run(now, r.id);
      event.run(r.id, "submit", JSON.stringify({ chars: (r.final_text ?? "").length }));
    }
    return db()
      .prepare("UPDATE assignments SET status = 'submitted', submitted_at = ? WHERE id = ? AND status IN ('not_started', 'in_progress')")
      .run(now, assignmentId).changes;
  })();
  if (changed) queueMarking(assignmentId);
}

/** Closes timed sets whose time (plus grace) is over, even if the student closed the tab. */
export function closeExpiredAssignments() {
  const rows = db()
    .prepare(
      `SELECT a.id FROM assignments a JOIN sets s ON s.id = a.set_id
        WHERE a.status = 'in_progress' AND s.helper = 'off' AND s.time_limit_min IS NOT NULL AND a.started_at IS NOT NULL
          AND strftime('%s', 'now') * 1000 > strftime('%s', a.started_at) * 1000 + s.time_limit_min * 60000 + ?`,
    )
    .all(GRACE_MS * 2) as { id: string }[];
  for (const r of rows) finalizeAssignment(r.id);
}

export type ResponseRow = {
  id: string;
  assignment_id: string;
  question_id: string;
  attempts: string;
  working_text: string | null;
  final_text: string | null;
  plan_text: string | null;
  photo_path: string | null;
  answers: string | null;
  hint_level: number;
  ai_questions: number;
  auto_correct: number | null;
  auto_marks: number | null;
  first_viewed_at: string | null;
  submitted_at: string | null;
};

export function startAssignment(a: AssignmentInfo) {
  if (a.status === "not_started") {
    db()
      .prepare("UPDATE assignments SET status = 'in_progress', started_at = ? WHERE id = ? AND status = 'not_started'")
      .run(new Date().toISOString(), a.id);
    a.status = "in_progress";
    a.started_at = new Date().toISOString();
  }
}

export function ensureResponse(a: AssignmentInfo, q: Question, position: number): ResponseRow {
  const existing = db()
    .prepare("SELECT * FROM responses WHERE assignment_id = ? AND question_id = ?")
    .get(a.id, q.id) as ResponseRow | undefined;
  if (existing) {
    if (!existing.first_viewed_at) {
      // a row the tutor created while marking: start the Helper lock now
      db().prepare("UPDATE responses SET first_viewed_at = ? WHERE id = ?").run(new Date().toISOString(), existing.id);
      existing.first_viewed_at = new Date().toISOString();
    }
    return existing;
  }
  const id = `rsp_${randomBytes(6).toString("hex")}`;
  const now = new Date().toISOString();
  const made = db()
    .prepare(
      `INSERT INTO responses (id, assignment_id, student_id, question_id, mode, first_viewed_at, position)
       VALUES (?, ?, ?, ?, 'assigned', ?, ?) ON CONFLICT (assignment_id, question_id) DO NOTHING`,
    )
    .run(id, a.id, a.student_id, q.id, now, position).changes;
  if (made) db().prepare("INSERT INTO events (response_id, type, data) VALUES (?, 'view', '{}')").run(id);
  return db().prepare("SELECT * FROM responses WHERE assignment_id = ? AND question_id = ?").get(a.id, q.id) as ResponseRow;
}

export function responsesFor(assignmentId: string): Map<string, ResponseRow> {
  const rows = db().prepare("SELECT * FROM responses WHERE assignment_id = ?").all(assignmentId) as ResponseRow[];
  return new Map(rows.map((r) => [r.question_id, r]));
}

/** Loads a response the signed-in student owns, with its assignment and question. */
export function ownedResponse(responseId: string, studentId: string) {
  const r = db()
    .prepare("SELECT * FROM responses WHERE id = ? AND student_id = ?")
    .get(responseId, studentId) as ResponseRow | undefined;
  if (!r) return null;
  const a = getAssignment(r.assignment_id, studentId);
  const qrow = db().prepare("SELECT data FROM questions WHERE id = ?").get(r.question_id) as { data: string } | undefined;
  if (!a || !qrow) return null;
  return { r, a, q: JSON.parse(qrow.data) as Question };
}

export const DEFAULT_PLAN_PROMPTS = ["Key terms to define", "Theory and diagram", "Real-world example", "Evaluation points"];

export function isWritten(q: Question): boolean {
  if (isPast(q)) return true;
  return q.format === "short_answer" || q.format === "diagram" || q.format === "essay";
}

// ---------- what the student's browser may see ----------

export type StudentQuestion = {
  id: string;
  format: Format;
  marks: number;
  prompt: string;
  commandTerm: string;
  label: string | null; // past-paper label
  context: Block[];
  lead: Block[];
  options?: { id: string; text: string }[];
  steps?: { id: string; text: string }[];
  parts?: { label: string; unit: string }[];
  planPrompts?: string[];
  mode: "auto" | "written";
  hasHints: boolean;
};

/** Strips answers, misconceptions, marking and unopened hints. */
function seededShuffle<T>(xs: T[], seed: string): T[] {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rand = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** `seed` (the response id) keeps the step order stable for one student. */
export function studentView(q: Question, seed = ""): StudentQuestion {
  const base = {
    id: q.id,
    format: q.format,
    marks: q.marks,
    prompt: q.prompt,
    commandTerm: q.command_term,
    hasHints: hintsFor(q) !== null,
  };
  if (isPast(q)) {
    return {
      ...base,
      label: q.past.label,
      context: pastContext(q.past.paper, q.past.question),
      lead: q.past.lead,
      mode: "written",
      planPrompts: q.format === "essay" ? DEFAULT_PLAN_PROMPTS : undefined,
    };
  }
  const common = { ...base, label: null, context: [], lead: tableBlock(q.table) };
  switch (q.format) {
    case "mcq":
      return { ...common, mode: "auto", options: q.options.map((o) => ({ id: o.id, text: o.text })) };
    case "analysis_chain":
      return {
        ...common,
        mode: "auto",
        steps: seededShuffle(q.steps, seed + q.id).map((s) => ({ id: s.id, text: s.text })),
      };
    case "calculation": {
      const parts = "parts" in q.answer ? q.answer.parts : [{ label: "", ...q.answer }];
      return { ...common, mode: "auto", parts: parts.map((p) => ({ label: p.label, unit: p.unit })) };
    }
    case "essay":
      return { ...common, mode: "written", planPrompts: q.plan_prompts?.length ? q.plan_prompts : DEFAULT_PLAN_PROMPTS };
    case "short_answer":
      return { ...common, mode: "written", planPrompts: q.plan_prompts };
    default:
      return { ...common, mode: "written" };
  }
}

export type ChatMsg = { who: "me" | "ai" | "marker"; text: string };

export type StudentResponse = {
  id: string;
  chat: ChatMsg[];
  attempts: { value: string; correct: boolean }[];
  working: string;
  finalText: string;
  plan: string;
  answers: string[];
  photo: boolean;
  hintLevel: number;
  openedHints: string[];
  submitted: boolean;
  correct: boolean | null;
  unlockAt: number;
};

export function studentResponse(r: ResponseRow, q: Question): StudentResponse {
  const hints = hintsFor(q);
  const events = db()
    .prepare("SELECT type, data FROM events WHERE response_id = ? AND type IN ('ai_message_student', 'ai_message_helper', 'hint_open') ORDER BY id")
    .all(r.id) as { type: string; data: string }[];
  const chat: ChatMsg[] = events.map((e) => {
    const d = json.parse<{ text?: string; level?: number }>(e.data, {});
    if (e.type === "hint_open") return { who: "marker", text: `Hint ${d.level} opened` };
    return { who: e.type === "ai_message_student" ? "me" : "ai", text: String(d.text ?? "") };
  });
  return {
    id: r.id,
    chat,
    attempts: json.parse<{ value: string; correct: boolean }[]>(r.attempts, []).map((x) => ({
      value: x.value,
      correct: x.correct,
    })),
    working: r.working_text ?? "",
    finalText: r.final_text ?? "",
    plan: r.plan_text ?? "",
    answers: json.parse<string[]>(r.answers, []),
    photo: Boolean(r.photo_path),
    hintLevel: r.hint_level,
    openedHints: hints ? hints.slice(0, r.hint_level) : [],
    submitted: Boolean(r.submitted_at),
    correct: r.auto_correct === null ? null : Boolean(r.auto_correct),
    unlockAt: new Date(r.first_viewed_at ?? Date.now()).getTime() + HELPER_LOCK_MS,
  };
}
