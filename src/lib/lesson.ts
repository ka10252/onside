import "server-only";
import { randomBytes } from "node:crypto";
import { bankRange, type BankQuestion } from "./admin";
import { answerText } from "./answer-text";
import { isPast, pastContext, tableBlock, type Block, type Question } from "./content";
import { diagramForTag } from "./diagram-for";
import { neededBlocks } from "./extract";
import { all, one, run, tx } from "./db";
import { weightByUnit, type UnitWeight } from "./unit-weight";
import { recipeFor, spanningIds, type Recipe } from "./lesson-template";
import { REVIEW_DEFAULT_KINDS, reviewKindOf, type ReviewKind } from "./question-types";
import { unitsOfLesson } from "./lesson-plan";

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
  homework_assignment_id: string | null;
  /** The sets, built and waiting to be looked at before they go. */
  review_set_id: string | null;
  homework_set_id: string | null;
};

export type LessonItem = { question_id: string; position: number; outcome: "right" | "wrong" | null };

export const newId = (p: string) => `${p}_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

export async function getLesson(id: string): Promise<(Lesson & { items: LessonItem[] }) | null> {
  const l = await one<Lesson>("SELECT * FROM lessons WHERE id = ?", id);
  if (!l) return null;
  const items = await all<LessonItem>("SELECT question_id, position, outcome FROM lesson_items WHERE lesson_id = ? ORDER BY position", id);
  return { ...l, items };
}

export function lessonsFor(studentId: string): Promise<Lesson[]> {
  return all<Lesson>("SELECT * FROM lessons WHERE student_id = ? ORDER BY created_at DESC", studentId);
}

/**
 * This unit's lesson, or a new one. Whatever its status: marking the first question in class makes
 * a lesson "taught", and opening the unit again afterwards has to come back to that same lesson —
 * its questions, its outcomes, and the homework still to send — rather than start an empty one.
 */
export async function openLesson(studentId: string, unit: number | null, title: string): Promise<Lesson> {
  const open = await one<Lesson>(
    `SELECT * FROM lessons WHERE student_id = ? AND unit IS NOT DISTINCT FROM ?
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
  /** The revision notes for this unit: what the student reads, and what only the tutor does. */
  notes: { headline: string; body: string; tutor: string } | null;
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
  const [weights, diagrams, commands, defined, stock, recipe, notes] = await Promise.all([
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
    one<{ headline: string; body: string; tutor: string }>("SELECT headline, body, tutor FROM unit_briefs WHERE unit = ?", unit),
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
    notes: notes ?? null,
  };
}

export type LessonNote = { unit: number; title: string; headline: string; body: string; tutor: string };

/**
 * The revision notes for every unit in one lesson, in the order they are taught. A lesson that
 * covers two units is one piece of material, not two files to open.
 */
export async function lessonNotes(units: number[]): Promise<LessonNote[]> {
  if (units.length === 0) return [];
  const holes = units.map(() => "?").join(", ");
  const rows = await all<LessonNote>(
    `SELECT b.unit, u.title, b.headline, b.body, b.tutor
       FROM unit_briefs b JOIN units u ON u.number = b.unit
      WHERE b.unit IN (${holes})`,
    ...units,
  );
  const by = new Map(rows.map((r) => [r.unit, r]));
  return units.map((n) => by.get(n)).filter((r): r is LessonNote => Boolean(r));
}

/** Every question this student has already been sent, whatever it came from. */
async function alreadySent(studentId: string): Promise<Set<string>> {
  const rows = await all<{ question_id: string }>(
    "SELECT DISTINCT i.question_id FROM assignments a JOIN set_items i ON i.set_id = a.set_id WHERE a.student_id = ?",
    studentId,
  );
  return new Set(rows.map((r) => r.question_id));
}

/** Past-paper questions for a lesson's units, with whether this student has had each. Lessons use past papers. */
export async function lessonPool(unit: number, studentId: string): Promise<(BankQuestion & { seen: boolean; spans: boolean })[]> {
  const units = unitsOfLesson(unit);
  const [bank, had, spans] = await Promise.all([bankRange(units), alreadySent(studentId), spanningIds(units)]);
  // Past papers, and the unit tests' multiple choice, which is the only place a warm-up comes from.
  return bank
    .filter((q) => q.source === "past" || q.format === "mcq")
    .map((q) => ({ ...q, seen: had.has(q.id), spans: spans.has(q.id) }));
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

export const REVIEW_TYPES = REVIEW_DEFAULT_KINDS;
export const REVIEW_SIZE = 10;

/** Takes turns between a lesson's units, so one of a pair cannot fill the whole set. */
function alternate(qs: BankQuestion[], units: number[]): BankQuestion[] {
  const queues = units.map((u) => qs.filter((q) => q.unit_number === u));
  const out: BankQuestion[] = [];
  while (queues.some((l) => l.length)) for (const l of queues) { const n = l.shift(); if (n) out.push(n); }
  return out;
}

/**
 * Fills n places by taking turns between the kinds, so a quiz of five over four kinds is one of
 * each and not four definitions. Each kind's list is already in the order it should be drawn from —
 * the questions that went wrong first, then others on the same ground — and the kind with the
 * fewest places so far goes next, ties broken by the order the kinds are asked in.
 */
function spread(byKind: Map<ReviewKind, BankQuestion[]>, kinds: ReviewKind[], n: number): BankQuestion[] {
  const held = new Map<ReviewKind, number>(kinds.map((k) => [k, 0]));
  const out: BankQuestion[] = [];
  while (out.length < n) {
    const next = kinds
      .filter((k) => (byKind.get(k)?.length ?? 0) > 0)
      .sort((a, b) => held.get(a)! - held.get(b)! || kinds.indexOf(a) - kinds.indexOf(b))[0];
    if (!next) break;
    out.push(byKind.get(next)!.shift()!);
    held.set(next, held.get(next)! + 1);
  }
  return out;
}

export type ReviewPlan = {
  /** Different questions on the idea that went wrong. */
  sameIdea: BankQuestion[];
  /** Others on the lesson's ground, to make up the number. */
  others: BankQuestion[];
  /** Why there are fewer than asked for, when there are. */
  short: string | null;
};

/**
 * What to ask after a lesson. Never the question that went wrong itself: a week later the student
 * may remember the wording rather than the idea, and the point is to find out whether the idea
 * landed (Jin, 2026-10-12). So the quiz is other questions on the same concept, then the same
 * syllabus section, then the rest of the ground the lesson covered. Multiple choice and short
 * answers only — a review quiz is for checking a hole has closed, not for writing an essay.
 */
export async function reviewPlan(lessonId: string, size = REVIEW_SIZE, kinds: ReviewKind[] = REVIEW_TYPES): Promise<ReviewPlan> {
  const kindOf = (q: BankQuestion) => reviewKindOf(q);
  const wanted = (q: BankQuestion) => {
    const k = kindOf(q);
    return k !== null && kinds.includes(k);
  };
  const lesson = await getLesson(lessonId);
  if (!lesson) return { sameIdea: [], others: [], short: "That lesson is gone." };
  // A quiz can be wanted before anything has gone wrong — the lesson may have gone well, or may
  // not be marked yet. Then there is nothing to re-ask and the whole quiz comes off the lesson's
  // ground instead, which still answers whether the revision happened (Jin, 2026-10-12).
  const wrongIds = lesson.items.filter((i) => i.outcome === "wrong").map((i) => i.question_id);

  // The whole unit, not just the past papers: the IB sets no multiple choice, so the short
  // questions that make a review quiz work come from the unit tests.
  const [bank, had] = await Promise.all([
    lesson.unit === null ? Promise.resolve([] as BankQuestion[]) : bankRange(unitsOfLesson(lesson.unit)),
    alreadySent(lesson.student_id),
  ]);
  const inUnit = new Map(bank.map((q) => [q.id, q]));

  // A wrong question is re-asked only if it is of a kind the tutor asked for.
  const wrong = wrongIds.map((id) => inUnit.get(id)).filter((q): q is BankQuestion => Boolean(q));

  // The idea that went wrong, as finely as the content says: the concepts tagged on those
  // questions, then the syllabus sections they sit in. Where nothing went wrong, the ground is
  // the sections the lesson itself covered, which is narrower than the whole unit.
  const concepts = new Set(
    wrongIds.length === 0
      ? []
      : (
          await all<{ concept_id: string }>(
            `SELECT DISTINCT concept_id FROM question_concepts WHERE question_id = ANY(?)`,
            wrongIds,
          )
        ).map((r) => r.concept_id),
  );
  const onConcept = new Set(
    concepts.size === 0
      ? []
      : (
          await all<{ question_id: string }>(
            `SELECT DISTINCT question_id FROM question_concepts WHERE concept_id = ANY(?)`,
            [...concepts],
          )
        ).map((r) => r.question_id),
  );
  const wrongSections = new Set(wrong.map((q) => q.section_id).filter(Boolean));
  const sections = wrongSections.size
    ? wrongSections
    : new Set(lesson.items.map((i) => inUnit.get(i.question_id)?.section_id).filter(Boolean));

  // Every question the lesson itself used is out, not only the ones that went wrong: the quiz asks
  // the idea again through something the student has not already sat in front of.
  const taken = new Set(lesson.items.map((i) => i.question_id));
  const unseen = bank.filter((q) => !taken.has(q.id) && wanted(q) && !had.has(q.id));
  const sameConcept = unseen.filter((q) => onConcept.has(q.id));
  const sameSection = unseen.filter((q) => !onConcept.has(q.id) && q.section_id && sections.has(q.section_id));
  const rest = unseen.filter((q) => !onConcept.has(q.id) && !(q.section_id && sections.has(q.section_id)));
  const closeIds = new Set([...sameConcept, ...sameSection].map((q) => q.id));

  // Each kind draws from its own list: nearest the wrong idea first, then the rest of the ground.
  // A lesson of two units takes turns between them, or one unit fills the whole quiz.
  const byUnit = (qs: BankQuestion[]) => alternate(qs, unitsOfLesson(lesson.unit));
  const byKind = new Map<ReviewKind, BankQuestion[]>(
    kinds.map((k) => [k, [...byUnit(sameConcept), ...byUnit(sameSection), ...byUnit(rest)].filter((q) => kindOf(q) === k)]),
  );
  const picked = spread(byKind, kinds, size);
  const order = (q: BankQuestion) => kinds.indexOf(kindOf(q)!);
  const sameIdea = picked.filter((q) => closeIds.has(q.id)).sort((a, b) => order(a) - order(b));
  const others = picked.filter((q) => !closeIds.has(q.id)).sort((a, b) => order(a) - order(b));

  const got = sameIdea.length + others.length;
  if (got === 0) {
    return { sameIdea: [], others: [], short: `No questions are left unseen in ${unitsOfLesson(lesson.unit).map((u) => `unit ${u}`).join(" and ")}.` };
  }
  const short =
    got >= size
      ? null
      : [
          wrongIds.length > 0 && sameIdea.length === 0 ? "nothing unseen was left on the ground that went wrong" : "",
          `only ${got} questions could be found in ${unitsOfLesson(lesson.unit).map((u) => `unit ${u}`).join(" and ")}`,
        ]
          .filter(Boolean)
          .join(" · ");
  return { sameIdea, others, short };
}

/**
 * The lesson's questions as the student should see them on a shared screen: the extracts, the
 * question and the options, and nothing else. No answer, no mark scheme, no hints — they are not
 * left out of the markup, they are never fetched, so there is nothing on the page to give away.
 */
export type TeachQuestion = {
  id: string;
  n: number;
  marks: number;
  format: string;
  label: string | null;
  prompt: string;
  context: Block[];
  lead: Block[];
  options: { id: string; text: string }[];
  outcome: "right" | "wrong" | null;
  /** For an essay: the outline of a model answer, which the tutor opens when the writing is done. */
  outline: string | null;
  /** For multiple choice only: which option is right, revealed when the class has chosen. */
  right: string | null;
  /** The figure the paper's own tag asks for, as one of the drawn diagrams, where we have it. */
  diagram: string | null;
};

export async function teachView(lessonId: string): Promise<TeachQuestion[]> {
  const lesson = await getLesson(lessonId);
  if (!lesson) return [];
  return teachQuestions(lesson.items);
}

/**
 * The review quiz on the same screen as the lesson's own questions, and marked the same way. The
 * two are different procedures: the lesson's questions check what the student understood on the
 * day, the review quiz checks at the start of the next lesson whether the revision happened
 * (Jin, 2026-10-08). Nothing here is sent to the student.
 */
export async function reviewQuizView(lessonId: string): Promise<TeachQuestion[]> {
  const lesson = await getLesson(lessonId);
  if (!lesson?.review_set_id) return [];
  const items = await all<LessonItem>(
    `SELECT i.question_id, i.position, o.outcome
       FROM set_items i LEFT JOIN review_outcomes o ON o.lesson_id = ? AND o.question_id = i.question_id
      WHERE i.set_id = ? ORDER BY i.position`,
    lessonId,
    lesson.review_set_id,
  );
  return teachQuestions(items);
}

/**
 * Every extra practice set a lesson has built, as one run of questions. It is not marked here —
 * this is work the student does at home — so the teaching screen only pages through it.
 */
export async function practiceView(lessonId: string): Promise<TeachQuestion[]> {
  const items = await all<LessonItem>(
    `SELECT i.question_id, i.position, NULL::text AS outcome
       FROM practice_sets p JOIN set_items i ON i.set_id = p.set_id
      WHERE p.lesson_id = ? ORDER BY p.created_at, i.position`,
    lessonId,
  );
  return teachQuestions(items);
}

async function teachQuestions(items: LessonItem[]): Promise<TeachQuestion[]> {
  if (items.length === 0) return [];
  const ids = items.map((i) => i.question_id);
  const holes = ids.map(() => "?").join(", ");
  const rows = await all<{ id: string; marks: number; format: string; data: string; diagram_type: string | null }>(
    `SELECT q.id, q.marks, q.format, q.data, p.diagram_type
       FROM questions q LEFT JOIN past_items p ON p.id = substr(q.id, 4)
      WHERE q.id IN (${holes})`,
    ...ids,
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  const outlines = new Map(
    (await all<{ question_id: string; outline: string }>(
      `SELECT question_id, outline FROM essay_outlines WHERE question_id IN (${holes})`,
      ...ids,
    )).map((r) => [r.question_id, r.outline]),
  );
  const out: TeachQuestion[] = [];
  for (const [i, item] of items.entries()) {
    const row = byId.get(item.question_id);
    if (!row) continue;
    const q = JSON.parse(row.data) as Question;
    const past = isPast(q);
    out.push({
      id: row.id,
      n: i + 1,
      marks: row.marks,
      format: row.format,
      label: past ? q.past.label : null,
      prompt: q.prompt,
      ...(past
        ? neededBlocks(q.past.lead, await pastContext(q.past.paper, q.past.question), q.prompt)
        : { context: [], lead: q.table ? tableBlock(q.table) : [] }),
      // The options, in their own order, with nothing saying which is right.
      options: !past && q.format === "mcq" ? q.options.map((o: { id: string; text: string }) => ({ id: o.id, text: o.text })) : [],
      outcome: item.outcome,
      outline: outlines.get(row.id) ?? null,
      // Only the letter, and only for multiple choice: nothing else about the answer is fetched.
      right: !past && q.format === "mcq" ? String(q.answer).toUpperCase() : null,
      diagram: diagramForTag(row.diagram_type),
    });
  }
  return out;
}

/** The same questions with their answers beside them. The preparing screen only — never the lesson. */
export type PrepareQuestion = TeachQuestion & { answer: string };

export async function prepareView(lessonId: string): Promise<PrepareQuestion[]> {
  return withAnswers(await teachView(lessonId));
}

/** The review quiz with its answers, so the tutor can go through it before running it. */
export async function prepareReviewView(lessonId: string): Promise<PrepareQuestion[]> {
  return withAnswers(await reviewQuizView(lessonId));
}

async function withAnswers(shown: TeachQuestion[]): Promise<PrepareQuestion[]> {
  if (shown.length === 0) return [];
  const holes = shown.map(() => "?").join(", ");
  const rows = await all<{ id: string; data: string }>(`SELECT id, data FROM questions WHERE id IN (${holes})`, ...shown.map((q) => q.id));
  const byId = new Map(rows.map((r) => [r.id, JSON.parse(r.data) as Question]));
  return shown.map((s) => {
    const q = byId.get(s.id);
    if (!q) return { ...s, answer: "" };
    const past = isPast(q);
    return { ...s, answer: past ? q.marking.text || "Not found in the mark scheme file." : answerText(q) };
  });
}


/** The questions a lesson never got to: picked for it, never marked right or wrong. */
export async function unfinished(lessonId: string): Promise<BankQuestion[]> {
  const lesson = await getLesson(lessonId);
  if (!lesson) return [];
  const left = lesson.items.filter((i) => i.outcome === null).map((i) => i.question_id);
  if (left.length === 0 || lesson.unit === null) return [];
  const bank = await bankRange(unitsOfLesson(lesson.unit));
  const byId = new Map(bank.map((q) => [q.id, q]));
  return left.map((id) => byId.get(id)).filter((q): q is BankQuestion => Boolean(q));
}

/**
 * Builds a set and gives back its id. `saveSet` is a form action and ends in a redirect, so the
 * lesson's own sends — the homework and the review quiz — write their set here instead and stay on
 * the page they were called from.
 */
export async function buildSet(input: {
  title: string;
  helper: "on" | "off";
  questionIds: string[];
  createdBy: string;
}): Promise<string> {
  const id = newId("set");
  await tx(async (t) => {
    await t.run(
      "INSERT INTO sets (id, title, mode, helper, created_by) VALUES (?, ?, 'assigned', ?, ?)",
      id,
      input.title,
      input.helper,
      input.createdBy,
    );
    const holes = input.questionIds.map(() => "(?, ?, ?)").join(", ");
    await t.run(
      `INSERT INTO set_items (set_id, position, question_id) VALUES ${holes}`,
      ...input.questionIds.flatMap((q, i) => [id, i + 1, q]),
    );
  });
  return id;
}

/** Sends a built set to the student now. */
export async function assignNow(setId: string, studentId: string, due: string | null): Promise<string> {
  const id = newId("asg");
  await run("INSERT INTO assignments (id, set_id, student_id, due_at) VALUES (?, ?, ?, ?)", id, setId, studentId, due);
  return id;
}

/**
 * What this lesson has actually sent. A set can be deleted from the sets screen after it has gone
 * out, and the lesson would go on pointing at it — hiding the controls for something that no longer
 * exists. Anything that has gone is forgotten here, so the lesson can send again.
 */
export async function lessonSends(lesson: Lesson): Promise<{ homework: boolean; review: boolean }> {
  const alive = async (id: string | null, table: "assignments" | "sets") => {
    if (!id) return false;
    const real = id.startsWith("queued:") ? id.slice("queued:".length) : id;
    const where = id.startsWith("queued:") ? "sets" : table;
    return Boolean(await one(`SELECT 1 FROM ${where} WHERE id = ?`, real));
  };
  const homework = await alive(lesson.homework_assignment_id, "assignments");
  const review = await alive(lesson.review_assignment_id, "assignments");
  const built = await alive(lesson.review_set_id, "sets");
  const clear: string[] = [];
  if (lesson.homework_assignment_id && !homework) clear.push("homework_assignment_id = NULL, homework_set_id = NULL");
  if (lesson.review_assignment_id && !review) clear.push("review_assignment_id = NULL");
  if (lesson.review_set_id && !built) clear.push("review_set_id = NULL");
  if (clear.length) await run(`UPDATE lessons SET ${clear.join(", ")} WHERE id = ?`, lesson.id);
  return { homework, review };
}

export type PracticeSet = {
  id: string;
  setId: string;
  title: string;
  questions: number;
  /** The assignment it went out as, or "queued:<set>" while it waits for its day. */
  assignmentId: string | null;
  createdAt: string;
};

/** The extra practice built for a lesson, newest last. */
export async function practiceSets(lessonId: string): Promise<PracticeSet[]> {
  return all<PracticeSet>(
    `SELECT p.id, p.set_id AS "setId", s.title, p.assignment_id AS "assignmentId", p.created_at AS "createdAt",
            (SELECT COUNT(*)::int FROM set_items i WHERE i.set_id = p.set_id) AS questions
       FROM practice_sets p JOIN sets s ON s.id = p.set_id
      WHERE p.lesson_id = ? ORDER BY p.created_at`,
    lessonId,
  );
}

/**
 * Every question this lesson has already spent: the ones taught in it, the review quiz, the
 * homework, every extra practice built before, and anything this student has ever been sent. Extra
 * practice draws from what is left, so a lesson can be topped up again without repeating itself.
 */
async function spentOn(lesson: Lesson & { items: LessonItem[] }): Promise<Set<string>> {
  const [fromSets, sent] = await Promise.all([
    all<{ question_id: string }>(
      `SELECT DISTINCT i.question_id FROM set_items i
        WHERE i.set_id IN (SELECT set_id FROM practice_sets WHERE lesson_id = ?)
           OR i.set_id = ? OR i.set_id = ?`,
      lesson.id,
      lesson.review_set_id ?? "",
      lesson.homework_set_id ?? "",
    ),
    alreadySent(lesson.student_id),
  ]);
  return new Set([...lesson.items.map((i) => i.question_id), ...fromSets.map((r) => r.question_id), ...sent]);
}

export type PracticePlan = { picked: BankQuestion[]; short: string | null };

/** Extra practice on the lesson's ground: n questions of the kinds asked for, none of them seen. */
export async function practicePlan(lessonId: string, size: number, kinds: ReviewKind[]): Promise<PracticePlan> {
  const lesson = await getLesson(lessonId);
  if (!lesson || lesson.unit === null) return { picked: [], short: "That lesson is gone." };
  const units = unitsOfLesson(lesson.unit);
  const [bank, spent] = await Promise.all([bankRange(units), spentOn(lesson)]);
  const free = bank.filter((q) => {
    const k = reviewKindOf(q);
    return k !== null && kinds.includes(k) && !spent.has(q.id);
  });
  const byKind = new Map<ReviewKind, BankQuestion[]>(
    kinds.map((k) => [k, alternate(free, units).filter((q) => reviewKindOf(q) === k)]),
  );
  const picked = spread(byKind, kinds, size);
  const where = units.map((u) => `unit ${u}`).join(" and ");
  return {
    picked,
    short: picked.length >= size ? null : `only ${picked.length} unseen ${picked.length === 1 ? "question is" : "questions are"} left in ${where}`,
  };
}
