import "server-only";
import { randomBytes } from "node:crypto";
import { bankRange, type BankQuestion } from "./admin";
import { all, one, run, tx } from "./db";
import { weightByUnit, type UnitWeight } from "./unit-weight";
import { recipeFor, type Recipe } from "./lesson-template";

/**
 * A lesson the tutor prepares, teaches, and then sends a review set from. It is their own working
 * space: nothing here is visible to the student and nothing touches daily practice, until the
 * review quiz goes out as an ordinary assignment.
 */
export type Lesson = {
  id: string;
  student_id: string;
  unit: number | null;
  title: string;
  status: "planning" | "taught";
  notes: string;
  created_at: string;
  taught_at: string | null;
  review_assignment_id: string | null;
};

export type LessonItem = { question_id: string; position: number; outcome: "right" | "wrong" | null };

const newId = (p: string) => `${p}_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

export async function getLesson(id: string): Promise<(Lesson & { items: LessonItem[] }) | null> {
  const l = await one<Lesson>("SELECT * FROM lessons WHERE id = ?", id);
  if (!l) return null;
  const items = await all<LessonItem>("SELECT question_id, position, outcome FROM lesson_items WHERE lesson_id = ? ORDER BY position", id);
  return { ...l, items };
}

export function lessonsFor(studentId: string): Promise<Lesson[]> {
  return all<Lesson>("SELECT * FROM lessons WHERE student_id = ? ORDER BY created_at DESC", studentId);
}

/** The lesson being prepared for a unit, or a new one. */
export async function openLesson(studentId: string, unit: number | null, title: string): Promise<Lesson> {
  const open = await one<Lesson>(
    `SELECT * FROM lessons WHERE student_id = ? AND status = 'planning' AND unit IS NOT DISTINCT FROM ?
      ORDER BY created_at DESC LIMIT 1`,
    studentId,
    unit,
  );
  if (open) return open;
  const id = newId("lsn");
  await run("INSERT INTO lessons (id, student_id, unit, title) VALUES (?, ?, ?, ?)", id, studentId, unit, title);
  return (await one<Lesson>("SELECT * FROM lessons WHERE id = ?", id))!;
}

/**
 * What the past papers say this unit is about: how heavily it is examined, the diagrams it asks
 * for, the command terms it uses and the terms it asks to define. Counted, not judged.
 */
export type UnitBrief = {
  unit: number;
  title: string;
  weight: UnitWeight | null;
  diagrams: { name: string; n: number }[];
  commands: { name: string; n: number }[];
  defined: { name: string; n: number }[];
  /** Past-paper questions in the bank, by what they ask for. */
  stock: { short: number; explain: number; essay: number };
  /** The question mix this unit calls for. */
  recipe: Recipe;
};

export async function unitBrief(unit: number): Promise<UnitBrief | null> {
  const u = await one<{ number: number; title: string }>("SELECT number, title FROM units WHERE number = ?", unit);
  if (!u) return null;
  const top = async (col: string) =>
    (
      await all<{ name: string; n: number }>(
        `SELECT ${col} AS name, COUNT(*)::int AS n FROM past_items
          WHERE unit_number = ? AND ${col} IS NOT NULL AND ${col} <> '' GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 6`,
        unit,
      )
    ).filter((r) => r.name);
  const [weights, diagrams, commands, defined, stock, recipe] = await Promise.all([
    weightByUnit(),
    top("diagram_type"),
    top("command_term"),
    top("defined_term"),
    one<{ short: number; explain: number; essay: number }>(
      `SELECT COUNT(*) FILTER (WHERE q.marks <= 3)::int AS short,
              COUNT(*) FILTER (WHERE q.marks BETWEEN 4 AND 9)::int AS explain,
              COUNT(*) FILTER (WHERE q.marks >= 10)::int AS essay
         FROM questions q JOIN units x ON x.id = q.unit_id
        WHERE x.number = ? AND q.source = 'past' AND q.approved_by_tutor = 1`,
      unit,
    ),
    recipeFor(unit),
  ]);
  return {
    unit,
    title: u.title,
    recipe,
    weight: weights.get(unit) ?? null,
    diagrams,
    commands,
    defined,
    stock: stock ?? { short: 0, explain: 0, essay: 0 },
  };
}

/** Every question this student has already been sent, whatever it came from. */
async function alreadySent(studentId: string): Promise<Set<string>> {
  const rows = await all<{ question_id: string }>(
    "SELECT DISTINCT i.question_id FROM assignments a JOIN set_items i ON i.set_id = a.set_id WHERE a.student_id = ?",
    studentId,
  );
  return new Set(rows.map((r) => r.question_id));
}

/** Past-paper questions for a unit, with whether this student has had each. Lessons use past papers. */
export async function lessonPool(unit: number, studentId: string): Promise<(BankQuestion & { seen: boolean })[]> {
  const [bank, had] = await Promise.all([bankRange([unit]), alreadySent(studentId)]);
  return bank.filter((q) => q.source === "past").map((q) => ({ ...q, seen: had.has(q.id) }));
}

export async function setLessonItems(lessonId: string, questionIds: string[]) {
  await tx(async (q) => {
    await q.run("DELETE FROM lesson_items WHERE lesson_id = ?", lessonId);
    for (const [i, id] of questionIds.entries()) {
      await q.run("INSERT INTO lesson_items (lesson_id, question_id, position) VALUES (?, ?, ?)", lessonId, id, i + 1);
    }
  });
}

export async function markOutcome(lessonId: string, questionId: string, outcome: "right" | "wrong" | null) {
  await run("UPDATE lesson_items SET outcome = ? WHERE lesson_id = ? AND question_id = ?", outcome, lessonId, questionId);
}

/** The review quiz is short: things a student can answer in a few minutes, not another essay. */
const REVIEW_FORMATS = ["mcq", "short_answer", "calculation"];
export const REVIEW_SIZE = 10;

export type ReviewPlan = {
  /** The ones that went wrong in the lesson, as far as they can be re-asked. */
  missed: BankQuestion[];
  /** Questions on the same ground, to meet them from another angle. */
  variants: BankQuestion[];
  /** Why there are fewer than asked for, when there are. */
  short: string | null;
};

/**
 * What to send after a lesson: the questions that went wrong, and others on the same ground so the
 * same idea is met a second time rather than the same wording memorised. Multiple choice and short
 * answers only — a review quiz is for checking a hole has closed, not for writing an essay.
 */
export async function reviewPlan(lessonId: string, size = REVIEW_SIZE): Promise<ReviewPlan> {
  const lesson = await getLesson(lessonId);
  if (!lesson) return { missed: [], variants: [], short: "That lesson is gone." };
  const wrongIds = lesson.items.filter((i) => i.outcome === "wrong").map((i) => i.question_id);
  if (wrongIds.length === 0) return { missed: [], variants: [], short: "Nothing was marked wrong in this lesson." };

  // The whole unit, not just the past papers: the IB sets no multiple choice, so the short
  // questions that make a review quiz work come from the unit tests.
  const [bank, had] = await Promise.all([
    lesson.unit === null ? Promise.resolve([] as BankQuestion[]) : bankRange([lesson.unit]),
    alreadySent(lesson.student_id),
  ]);
  const inUnit = new Map(bank.map((q) => [q.id, q]));

  // A wrong question is re-asked only if it is short enough to be worth re-asking.
  const missed = wrongIds.map((id) => inUnit.get(id)).filter((q): q is BankQuestion => Boolean(q) && REVIEW_FORMATS.includes(q!.format));
  const essayWrong = wrongIds.length - missed.length;

  // Same section first, then the rest of the unit; never one they have already been sent.
  const sections = new Set(missed.map((q) => q.section_id).filter(Boolean));
  const taken = new Set(wrongIds);
  const unseen = bank.filter((q) => !taken.has(q.id) && REVIEW_FORMATS.includes(q.format) && !had.has(q.id));
  const sameSection = unseen.filter((q) => q.section_id && sections.has(q.section_id));
  const rest = unseen.filter((q) => !(q.section_id && sections.has(q.section_id)));
  const variants = [...sameSection, ...rest].slice(0, Math.max(0, size - missed.length));

  const got = missed.length + variants.length;
  const short =
    got >= size
      ? null
      : [
          essayWrong > 0 ? `${essayWrong} of the wrong ones were essays, which a review quiz doesn't re-ask` : "",
          `only ${got} questions could be found in unit ${lesson.unit}`,
        ]
          .filter(Boolean)
          .join(" · ");
  return { missed, variants, short };
}
