"use server";

import { bankQuestions, bankRange, type BankQuestion } from "./admin";
import { generateForUnit } from "./ai/generate";
import { AiNotConfiguredError } from "./ai/provider";
import { answerText } from "./answer-text";
import { isPast, pastContext, tableBlock, type Block } from "./content";
import { all, one } from "./db";
import { requireUser } from "./session";

export type Preview = {
  prompt: string;
  label: string | null;
  context: Block[];
  lead: Block[];
  options: { id: string; text: string; right: boolean }[];
  answer: string;
  hints: [string, string] | null;
  draft: boolean;
};

/** Full question and answer for the set builder (tutor only). */
export async function previewQuestion(id: string): Promise<Preview | null> {
  await requireUser("tutor");
  const row = await one<{ data: string; approved_by_tutor: number }>("SELECT data, approved_by_tutor FROM questions WHERE id = ?", id);
  if (!row) return null;
  const q = JSON.parse(row.data);
  const past = isPast(q);
  return {
    prompt: q.prompt,
    label: past ? q.past.label : null,
    context: past ? await pastContext(q.past.paper, q.past.question) : [],
    lead: past ? q.past.lead : tableBlock(q.table),
    options: !past && q.format === "mcq" ? q.options.map((o: { id: string; text: string }) => ({ ...o, right: o.id === q.answer })) : [],
    answer: past || q.format !== "mcq" ? answerText(q) : "",
    hints: q.hints && q.hints[0] ? q.hints : null,
    draft: row.approved_by_tutor === 0,
  };
}

const FORMATS = ["mcq", "short_answer", "calculation", "essay"] as const;

/** New AI questions spread over the chosen units. Drafts until the set is saved. */
export async function generateQuestions(
  units: number[],
  total: number,
  formats: (typeof FORMATS)[number][],
): Promise<{ questions: BankQuestion[] } | { error: string }> {
  await requireUser("tutor");
  const list = [...new Set(units)].filter((n) => Number.isInteger(n) && n >= 1 && n <= 20).slice(0, 20);
  const n = Math.max(1, Math.min(10, Math.floor(total)));
  const fmts = formats.filter((f) => FORMATS.includes(f));
  if (!list.length) return { error: "Choose at least one unit first." };
  if (!fmts.length) return { error: "Choose at least one question type for AI questions." };
  const per = list.map((u, i) => ({ u, k: Math.floor(n / list.length) + (i < n % list.length ? 1 : 0) })).filter((x) => x.k > 0);
  const ids: string[] = [];
  try {
    for (const { u, k } of per) ids.push(...(await generateForUnit(u, k, fmts)));
  } catch (e) {
    if (e instanceof AiNotConfiguredError) return { error: "AI isn't set up. Add an API key to .env.local and restart." };
    console.error("generate failed", e);
    if (!ids.length) return { error: "The AI is busy. Try again in a minute." };
  }
  if (!ids.length) return { error: "The AI returned no usable questions. Try again." };
  const set = new Set(ids);
  return { questions: (await bankQuestions(true)).filter((q) => set.has(q.id)) };
}

/**
 * The questions of the units the tutor is looking at. The builder asks for a range as the unit
 * boxes are ticked, so opening it no longer ships the whole bank to the browser.
 */
export async function loadBankRange(units: number[]): Promise<BankQuestion[]> {
  await requireUser("tutor");
  const clean = [...new Set(units)].filter((u) => Number.isInteger(u) && u > 0 && u <= 99).slice(0, 40);
  return bankRange(clean);
}

export type SeenState = { state: "answered" | "sent"; at: string; set: string };

/** Every question a student has been sent, and whether they answered it. */
export async function studentHistory(studentId: string): Promise<Record<string, SeenState>> {
  await requireUser("tutor");
  const rows = await all<{
    question_id: string;
    title: string;
    assigned_at: string;
    submitted_at: string | null;
    final_text: string | null;
    attempts: string | null;
    photo_path: string | null;
    answers: string | null;
  }>(
    `SELECT i.question_id, s.title, a.assigned_at, r.submitted_at, r.final_text, r.attempts, r.photo_path, r.answers
       FROM assignments a
       JOIN sets s ON s.id = a.set_id
       JOIN set_items i ON i.set_id = a.set_id
       LEFT JOIN responses r ON r.assignment_id = a.id AND r.question_id = i.question_id
      WHERE a.student_id = ?
      ORDER BY a.assigned_at`,
    studentId,
  );
  const out: Record<string, SeenState> = {};
  for (const r of rows) {
    const answered = Boolean(r.submitted_at && (r.final_text?.trim() || r.photo_path || (r.attempts && r.attempts !== "[]") || r.answers));
    const prev = out[r.question_id];
    if (answered) out[r.question_id] = { state: "answered", at: r.submitted_at!, set: r.title };
    else if (!prev) out[r.question_id] = { state: "sent", at: r.assigned_at, set: r.title };
  }
  return out;
}
