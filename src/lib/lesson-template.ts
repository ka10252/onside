import "server-only";
import { bankRange, type BankQuestion } from "./admin";
import { all, one } from "./db";
import { unitsOfLesson } from "./lesson-plan";

/**
 * A lesson's question mix, worked out from what the past papers ask of that unit rather than fixed
 * by hand. Unit 8 is two-thirds calculation, unit 9 is almost all explanation, unit 20 is mostly
 * evaluation — a lesson that ignores that spends its hour on the wrong thing.
 */
export type Recipe = {
  unit: number;
  /** Warm-up, from the unit tests: the IB sets no multiple choice. */
  mcq: number;
  /** 1–3 marks: definitions and calculations. */
  short: number;
  /** 4–9 marks: the explanation questions. */
  explain: number;
  /** 10+ marks: written in the lesson, or planned and finished at home. */
  essay: number;
  /** What the papers do with this unit, as shares of its items. */
  demand: { calculate: number; explain: number; evaluate: number; define: number };
  why: string;
};

/** The questions a lesson holds. Ten is a two-hour lesson's worth with time to talk. */
const LESSON_SIZE = 10;

export async function recipeFor(unit: number): Promise<Recipe> {
  const d = await one<{ calc: number; explain: number; evaluate: number; define: number; total: number }>(
    `SELECT COUNT(*) FILTER (WHERE command_term IN ('calculate','show that','determine','construct'))::int AS calc,
            COUNT(*) FILTER (WHERE command_term IN ('explain','describe','outline','distinguish'))::int AS explain,
            COUNT(*) FILTER (WHERE command_term IN ('evaluate','discuss','examine','recommend','justify'))::int AS evaluate,
            COUNT(*) FILTER (WHERE command_term IN ('define','state','identify','list'))::int AS define,
            COUNT(*)::int AS total
       FROM past_items WHERE unit_number = ?`,
    unit,
  );
  const total = d?.total || 1;
  const demand = {
    calculate: (d?.calc ?? 0) / total,
    explain: (d?.explain ?? 0) / total,
    evaluate: (d?.evaluate ?? 0) / total,
    define: (d?.define ?? 0) / total,
  };

  // One essay in a two-hour lesson; two only where the unit is mostly evaluation. A unit the
  // papers never ask to evaluate — the AD/AS mechanics, the introduction — gets none.
  const essay = demand.evaluate >= 0.45 ? 2 : demand.evaluate >= 0.08 ? 1 : 0;
  const left = LESSON_SIZE - essay;
  // Calculations and definitions are short questions; explanation is the 4–9 mark band.
  const shortWeight = demand.calculate + demand.define;
  const explainWeight = demand.explain;
  const sum = shortWeight + explainWeight || 1;
  const explain = Math.round((left * explainWeight) / sum);
  const short = left - explain;

  const why = [
    demand.calculate >= 0.4 ? "mostly calculation" : "",
    demand.explain >= 0.5 ? "mostly explanation" : "",
    demand.evaluate >= 0.4 ? "mostly evaluation" : "",
    demand.define >= 0.4 ? "mostly definitions" : "",
  ]
    .filter(Boolean)
    .join(" and ");
  return {
    unit,
    // A warm-up on top of the ten, never none: a lesson opens better with something quick.
    mcq: Math.min(6, Math.max(2, Math.round(short / 2))),
    short,
    explain,
    essay,
    demand,
    why: why || "a mix of explanation and short questions",
  };
}

export type FilledTemplate = { recipe: Recipe; picked: BankQuestion[]; short: string | null };

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
function essays(free: BankQuestion[], want: number): BankQuestion[] {
  if (want <= 0) return [];
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
    if (out.length >= want) break;
    out.push(...set);
  }
  if (out.length > 0) return out;
  // No complete set left in this unit: one essay on its own is better than none.
  return spread(all, want);
}

/**
 * The recipe turned into actual questions: past papers for everything the IB sets, unit tests for
 * the multiple-choice warm-up, and never one this student has already been sent.
 */
export async function fillTemplate(unit: number, studentId: string): Promise<FilledTemplate> {
  const [recipe, bank, sent] = await Promise.all([
    recipeFor(unit),
    bankRange(unitsOfLesson(unit)),
    all<{ question_id: string }>(
      "SELECT DISTINCT i.question_id FROM assignments a JOIN set_items i ON i.set_id = a.set_id WHERE a.student_id = ?",
      studentId,
    ),
  ]);
  const had = new Set(sent.map((r) => r.question_id));
  const free = bank.filter((q) => !had.has(q.id));
  const take = (n: number, pick: (q: BankQuestion) => boolean) => spread(free.filter(pick), n);

  const picked = [
    ...take(recipe.mcq, (q) => q.format === "mcq"),
    ...take(recipe.short, (q) => q.source === "past" && q.marks <= 3 && q.format !== "mcq"),
    ...take(recipe.explain, (q) => q.source === "past" && q.marks >= 4 && q.marks <= 9),
    ...essays(free, recipe.essay),
  ];
  const asked = recipe.mcq + recipe.short + recipe.explain + recipe.essay;
  return {
    recipe,
    picked,
    short: picked.length < asked ? `only ${picked.length} of ${asked} are left unseen in unit ${unit}` : null,
  };
}
