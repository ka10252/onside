import "server-only";
import { bankRange, type BankQuestion } from "./admin";
import { all, one } from "./db";
import { unitsOfLesson } from "./lesson-plan";
import { Q_TYPES, TYPE_LABEL, typeOf, type QType } from "./question-types";

export { Q_TYPES, TYPE_LABEL, typeOf, type QType };

export type Recipe = {
  unit: number;
  mcq: number;
  definition: number;
  short: number;
  diagram: number;
  /** Essay sets, not essays: one set is an (a) and a (b) taken together. */
  essay: number;
  why: string;
};

/** What a two-hour lesson holds: a warm-up, the short work, the diagrams, and one essay set. */
const FIXED: Omit<Recipe, "unit" | "why"> = { mcq: 2, definition: 2, short: 2, diagram: 4, essay: 1 };

export async function recipeFor(unit: number): Promise<Recipe> {
  const d = await one<{ diagram: number; define: number; total: number }>(
    `SELECT COUNT(*) FILTER (WHERE diagram_type IS NOT NULL AND diagram_type <> '')::int AS diagram,
            COUNT(*) FILTER (WHERE command_term = 'define')::int AS define,
            COUNT(*)::int AS total
       FROM past_items WHERE unit_number = ANY(?)`,
    unitsOfLesson(unit),
  );
  const total = d?.total || 1;
  const drawn = (d?.diagram ?? 0) / total;
  // A unit the papers rarely ask to draw spends those places on short answers instead.
  const diagram = drawn >= 0.3 ? 4 : drawn >= 0.1 ? 3 : 1;
  const short = FIXED.short + (FIXED.diagram - diagram);
  const why =
    drawn >= 0.3
      ? "a diagram unit"
      : drawn >= 0.1
        ? "part diagram, part written"
        : "almost no diagrams in the papers";
  return { unit, ...FIXED, diagram, short, why };
}

export type FilledTemplate = { recipe: Recipe; picked: BankQuestion[]; short: string | null; spanned: number };

/**
 * The questions that tie a lesson's units together: tagged to one of them, and in the paper's own
 * secondary tags to another. Those are the questions a lesson of two units should actually ask.
 */
export async function spanningIds(units: number[]): Promise<Set<string>> {
  if (units.length < 2) return new Set();
  const holes = units.map(() => "?").join(", ");
  const rows = await all<{ id: string; number: number; secondary: string }>(
    `SELECT q.id, u.number, p.secondary
       FROM questions q JOIN units u ON u.id = q.unit_id JOIN past_items p ON p.id = substr(q.id, 4)
      WHERE u.number IN (${holes}) AND p.secondary IS NOT NULL AND p.secondary <> ''`,
    ...units,
  );
  const out = new Set<string>();
  for (const r of rows) {
    // Secondary tags are syllabus sections — "17.1 9.2" — so the unit is the part before the dot.
    const tagged = r.secondary.split(/\s+/).map((t) => Number(t.split(".")[0]));
    if (units.some((u) => u !== r.number && tagged.includes(u))) out.add(r.id);
  }
  return out;
}

/** Which paper a question came from, for spreading a lesson across all three. */
const paperOf = (q: BankQuestion): string => q.past_label?.match(/\bP(\d)\b/)?.[0] ?? q.paper_style?.slice(0, 2) ?? "unit test";
/** M24 → 2405, N23 → 2311, so the newest sessions come first. */
const sessionOf = (q: BankQuestion): number =>
  q.session ? Number(q.session.slice(1)) * 100 + (q.session[0] === "M" ? 5 : 11) : 0;

/**
 * Takes n questions across the papers rather than down one. Picking in id order filled a unit 16
 * lesson with nine Paper 2 questions and no Paper 3 at all, though nineteen Paper 3 questions were
 * sitting there. Papers take turns, newest session first within each.
 */
function spread(pool: BankQuestion[], n: number): BankQuestion[] {
  if (n <= 0) return [];
  const queues = new Map<string, BankQuestion[]>();
  for (const q of [...pool].sort((a, b) => sessionOf(b) - sessionOf(a))) {
    const key = paperOf(q);
    queues.set(key, [...(queues.get(key) ?? []), q]);
  }
  const lists = [...queues.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);
  const out: BankQuestion[] = [];
  while (out.length < n && lists.some((l) => l.length)) {
    for (const list of lists) {
      if (out.length >= n) break;
      const next = list.shift();
      if (next) out.push(next);
    }
  }
  return out;
}

/** "M24 P1 TZ1 HL · Q3(a)" and "…Q3(b)" are one question in the paper; this is what they share. */
const stemOf = (q: BankQuestion): string | null => {
  const label = q.past_label;
  if (!label || !/\((a|b)\)\s*$/i.test(label)) return null;
  return label.replace(/\((a|b)\)\s*$/i, "").trim();
};

/**
 * Essays come as the paper sets them: Paper 1 asks a 10-mark (a) and a 15-mark (b) under one
 * question, and a lesson that sends only the (b) hides half of it. Whole sets are preferred, so the
 * tutor can have the student outline either part (Jin, 2026-10-02).
 */
function essays(free: BankQuestion[], wantSets: number): BankQuestion[] {
  if (wantSets <= 0) return [];
  const all = free.filter((q) => q.source === "past" && q.marks >= 10);
  const sets = new Map<string, BankQuestion[]>();
  for (const q of all) {
    const stem = stemOf(q);
    if (stem) sets.set(stem, [...(sets.get(stem) ?? []), q]);
  }
  // Whole sets first, newest session first; (a) before (b).
  const whole = [...sets.values()]
    .filter((v) => v.length >= 2)
    .sort((a, b) => sessionOf(b[0]!) - sessionOf(a[0]!))
    .map((v) => [...v].sort((x, y) => (x.past_label ?? "").localeCompare(y.past_label ?? "")));

  const out: BankQuestion[] = [];
  for (const set of whole) {
    if (out.length >= wantSets * 2) break;
    out.push(...set);
  }
  if (out.length > 0) return out;
  // No complete set left in this unit: one essay on its own is better than none.
  return spread(all, wantSets);
}

/**
 * The recipe turned into actual questions: past papers for everything the IB sets, unit tests for
 * the multiple-choice warm-up, and never one this student has already been sent.
 */
export async function fillTemplate(unit: number, studentId: string): Promise<FilledTemplate> {
  const units = unitsOfLesson(unit);
  const [recipe, bank, sent, spans] = await Promise.all([
    recipeFor(unit),
    bankRange(units),
    all<{ question_id: string }>(
      "SELECT DISTINCT i.question_id FROM assignments a JOIN set_items i ON i.set_id = a.set_id WHERE a.student_id = ?",
      studentId,
    ),
    spanningIds(units),
  ]);
  const had = new Set(sent.map((r) => r.question_id));
  const free = bank.filter((q) => !had.has(q.id));
  const take = (n: number, type: QType) => spread(free.filter((q) => typeOf(q) === type && (type === "mcq" || q.source === "past")), n);

  // The five kinds, in the order the lesson runs, with the essay set last.
  const picked = [
    ...take(recipe.mcq, "mcq"),
    ...take(recipe.definition, "definition"),
    ...take(recipe.short, "short"),
    ...take(recipe.diagram, "diagram"),
  ];
  const essaySet = essays(free, recipe.essay);

  // A lesson of two units should ask at least one question that needs both of them. If none of the
  // picks does, the newest such question takes the place of one of the same kind.
  if (units.length > 1 && ![...picked, ...essaySet].some((q) => spans.has(q.id))) {
    for (const want of ["diagram", "short", "definition"] as const) {
      const both = spread(free.filter((q) => spans.has(q.id) && q.source === "past" && typeOf(q) === want), 1);
      const swap = picked.findLastIndex((q) => typeOf(q) === want);
      if (both[0] && swap >= 0) {
        picked[swap] = both[0];
        break;
      }
    }
  }
  picked.push(...essaySet);
  const asked = recipe.mcq + recipe.definition + recipe.short + recipe.diagram + recipe.essay * 2;
  const where = units.length > 1 ? `units ${units.join(" and ")}` : `unit ${unit}`;
  return {
    recipe,
    picked,
    spanned: picked.filter((q) => spans.has(q.id)).length,
    short: picked.length < asked ? `only ${picked.length} of ${asked} are left unseen in ${where}` : null,
  };
}
