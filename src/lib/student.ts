import "server-only";
import { randomBytes } from "node:crypto";
import { isPast, pastContext, tableBlock, type Block, type Format, type Question } from "./content";
import { all, json, one, run, tx } from "./db";
import { after } from "next/server";
import { queueMarking } from "./ai/marking";
import { notifySubmitted } from "./notify";
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

export async function getAssignment(id: string, studentId: string): Promise<AssignmentInfo | null> {
  await closeExpiredAssignments();
  return (
    (await one<AssignmentInfo>(
      `SELECT a.id, a.set_id, a.student_id, a.status, a.due_at, a.started_at, a.submitted_at,
              s.title, s.helper, s.time_limit_min
         FROM assignments a JOIN sets s ON s.id = a.set_id
        WHERE a.id = ? AND a.student_id = ?`,
      id,
      studentId,
    )) ?? null
  );
}

export async function setQuestions(setId: string): Promise<Question[]> {
  return (
    await all<{ data: string }>(
      "SELECT q.data FROM set_items i JOIN questions q ON q.id = i.question_id WHERE i.set_id = ? ORDER BY i.position",
      setId,
    )
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
export async function finalizeAssignment(assignmentId: string) {
  const now = new Date().toISOString();
  const changed = await tx(async (q) => {
    // Claim the assignment first so two submits never mark twice.
    const claimed = await q.run(
      "UPDATE assignments SET status = 'submitted', submitted_at = ? WHERE id = ? AND status IN ('not_started', 'in_progress')",
      now,
      assignmentId,
    );
    if (!claimed) return 0;
    const rows = await q.all<ResponseRow & { qdata: string }>(
      `SELECT r.*, q.data AS qdata FROM responses r JOIN questions q ON q.id = r.question_id
        WHERE r.assignment_id = ? AND r.submitted_at IS NULL`,
      assignmentId,
    );
    const event = (id: string, type: string, data: object) =>
      q.run("INSERT INTO events (response_id, type, data) VALUES (?, ?, ?)", id, type, JSON.stringify(data));
    for (const r of rows) {
      if (!hasAnswer(r)) continue;
      const question = JSON.parse(r.qdata) as Question;
      const answers = json.parse<string[]>(r.answers, []);
      const g = answers.length ? gradeAuto(question, answers) : null;
      if (g) {
        await q.run(
          "UPDATE responses SET attempts = ?, auto_correct = ?, auto_marks = ? WHERE id = ?",
          JSON.stringify([{ value: g.value, at: now, correct: g.correct }]),
          g.correct ? 1 : 0,
          g.marks,
          r.id,
        );
        await event(r.id, "attempt", { value: g.value, correct: g.correct, n: 1, ...(g.misconception ? { misconception: g.misconception } : {}) });
      }
      await q.run("UPDATE responses SET submitted_at = ? WHERE id = ?", now, r.id);
      await event(r.id, "submit", { chars: (r.final_text ?? "").length });
    }
    return claimed;
  });
  if (changed) {
    queueMarking(assignmentId);
    tellTutor(assignmentId);
  }
}

/** Sends the tutor a note that this came in, after the student's page has been answered. */
function tellTutor(assignmentId: string) {
  const job = () => notifySubmitted(assignmentId).catch((e) => console.error("submit notice failed", e));
  try {
    after(job);
  } catch {
    void job(); // outside a request (scripts, tests)
  }
}

/** Closes timed sets whose time (plus grace) is over, even if the student closed the tab. */
export async function closeExpiredAssignments() {
  const rows = await all<{ id: string; started_at: string; time_limit_min: number }>(
    `SELECT a.id, a.started_at, s.time_limit_min FROM assignments a JOIN sets s ON s.id = a.set_id
      WHERE a.status = 'in_progress' AND s.helper = 'off' AND s.time_limit_min IS NOT NULL AND a.started_at IS NOT NULL`,
  );
  const now = Date.now();
  for (const r of rows) {
    if (now > new Date(r.started_at).getTime() + r.time_limit_min * 60_000 + GRACE_MS * 2) await finalizeAssignment(r.id);
  }
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

export async function startAssignment(a: AssignmentInfo) {
  if (a.status === "not_started") {
    const now = new Date().toISOString();
    await run("UPDATE assignments SET status = 'in_progress', started_at = ? WHERE id = ? AND status = 'not_started'", now, a.id);
    a.status = "in_progress";
    a.started_at = now;
  }
}

export async function ensureResponse(a: AssignmentInfo, q: Question, position: number): Promise<ResponseRow> {
  const existing = await one<ResponseRow>("SELECT * FROM responses WHERE assignment_id = ? AND question_id = ?", a.id, q.id);
  if (existing) {
    if (!existing.first_viewed_at) {
      // a row the tutor created while marking: start the Helper lock now
      existing.first_viewed_at = new Date().toISOString();
      await run("UPDATE responses SET first_viewed_at = ? WHERE id = ?", existing.first_viewed_at, existing.id);
    }
    return existing;
  }
  const id = `rsp_${randomBytes(6).toString("hex")}`;
  const now = new Date().toISOString();
  const made = await run(
    `INSERT INTO responses (id, assignment_id, student_id, question_id, mode, first_viewed_at, position)
     VALUES (?, ?, ?, ?, 'assigned', ?, ?) ON CONFLICT (assignment_id, question_id) DO NOTHING`,
    id,
    a.id,
    a.student_id,
    q.id,
    now,
    position,
  );
  if (made) await run("INSERT INTO events (response_id, type, data) VALUES (?, 'view', '{}')", id);
  return (await one<ResponseRow>("SELECT * FROM responses WHERE assignment_id = ? AND question_id = ?", a.id, q.id))!;
}

export async function responsesFor(assignmentId: string): Promise<Map<string, ResponseRow>> {
  const rows = await all<ResponseRow>("SELECT * FROM responses WHERE assignment_id = ?", assignmentId);
  return new Map(rows.map((r) => [r.question_id, r]));
}

/** Loads a response the signed-in student owns, with its assignment and question. */
export async function ownedResponse(responseId: string, studentId: string) {
  const r = await one<ResponseRow>("SELECT * FROM responses WHERE id = ? AND student_id = ?", responseId, studentId);
  if (!r) return null;
  const a = await getAssignment(r.assignment_id, studentId);
  const qrow = await one<{ data: string }>("SELECT data FROM questions WHERE id = ?", r.question_id);
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
export async function studentView(q: Question, seed = ""): Promise<StudentQuestion> {
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
      context: await pastContext(q.past.paper, q.past.question),
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

export async function studentResponse(r: ResponseRow, q: Question): Promise<StudentResponse> {
  const hints = hintsFor(q);
  const events = await all<{ type: string; data: string }>(
    "SELECT type, data FROM events WHERE response_id = ? AND type IN ('ai_message_student', 'ai_message_helper', 'hint_open') ORDER BY id",
    r.id,
  );
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
