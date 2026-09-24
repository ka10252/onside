// Question bank filtering and random picking for the set builder. Pure, so it runs in the browser and in tests.

export type BankItem = {
  id: string;
  unit_number: number;
  format: string;
  paper_style: string | null;
  command_term: string | null;
  marks: number;
  prompt: string;
  targets: string;
  source: string;
  past_label: string | null;
  level: string | null;
  session: string | null;
  skill: string | null;
};

export type Source = "onside" | "test" | "ai" | "P1" | "P2" | "P3";

export type BankFilter = {
  units: number[]; // empty = all
  sources: Source[]; // empty = all
  level: "any" | "HL" | "SL";
  skills: string[]; // empty = all
  formats: string[]; // mcq | calculation | short_answer | diagram | essay | analysis_chain; empty = all
  /** Exam sessions as yymm (May = 05, November = 11), inclusive. Only past papers are limited. */
  from: number | null;
  to: number | null;
  search: string;
};

export const SKILLS = [
  "definition",
  "calculation",
  "diagram explanation",
  "short explanation",
  "extended response",
  "evaluation essay",
  "multiple choice",
  "analysis chain",
] as const;

export const EMPTY_FILTER: BankFilter = { units: [], sources: [], level: "any", skills: [], formats: [], from: null, to: null, search: "" };

/** Past-paper sessions available, oldest first: M22 → 2205, N22 → 2211, … */
export const SESSIONS = [22, 23, 24, 25].flatMap((y) => [
  { yymm: y * 100 + 5, label: `${y}05 · May 20${y}` },
  { yymm: y * 100 + 11, label: `${y}11 · Nov 20${y}` },
]);

export function sourceOf(q: Pick<BankItem, "source" | "paper_style">): Source {
  if (q.source === "ai") return "ai";
  if (q.source === "unit-test") return "test";
  if (q.source !== "past") return "onside";
  return (q.paper_style?.slice(0, 2) as Source) ?? "P2";
}

/** Past items carry a classified skill; Onside questions get one from their format. */
export function skillOf(q: BankItem): string {
  if (q.skill) return q.skill;
  switch (q.format) {
    case "mcq":
      return "multiple choice";
    case "analysis_chain":
      return "analysis chain";
    case "calculation":
      return "calculation";
    case "diagram":
      return "diagram explanation";
    case "essay":
      return "evaluation essay";
    default:
      if (q.command_term === "define") return "definition";
      return q.marks >= 10 ? "extended response" : "short explanation";
  }
}

export function yymmOf(q: BankItem): number | null {
  if (!q.session) return null;
  return Number(q.session.slice(1)) * 100 + (q.session[0] === "M" ? 5 : 11);
}

export function matches(q: BankItem, f: BankFilter): boolean {
  if (f.units.length && !f.units.includes(q.unit_number)) return false;
  if (f.sources.length && !f.sources.includes(sourceOf(q))) return false;
  if (f.level !== "any" && q.level && q.level !== "HLSL" && q.level !== f.level) return false;
  if (f.skills.length && !f.skills.includes(skillOf(q))) return false;
  if (f.formats.length && !f.formats.includes(q.format)) return false;
  const ym = yymmOf(q);
  if (ym !== null && ((f.from && ym < f.from) || (f.to && ym > f.to))) return false;
  const needle = f.search.trim().toLowerCase();
  if (needle) {
    const hay = `${q.prompt} ${q.targets ?? ""} ${q.past_label ?? ""}`.toLowerCase();
    if (!hay.includes(needle)) return false;
  }
  return true;
}

/** Same question printed in two time zones counts once. */
export function sameQuestionKey(q: BankItem): string {
  return `${q.unit_number}|${q.prompt.replace(/\*\*/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;
}

function shuffle<T>(xs: T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Picks up to n new questions from the pool. With `spread`, units take turns so a mix of units
 * gets an even share. Skips questions already chosen and repeats of the same question.
 */
export function pickRandom(
  pool: BankItem[],
  n: number,
  alreadyChosen: BankItem[],
  spread: boolean,
  rand: () => number = Math.random,
): BankItem[] {
  const seen = new Set(alreadyChosen.map(sameQuestionKey));
  const chosenIds = new Set(alreadyChosen.map((q) => q.id));
  const candidates = pool.filter((q) => !chosenIds.has(q.id));
  const out: BankItem[] = [];
  const take = (q: BankItem) => {
    const key = sameQuestionKey(q);
    if (seen.has(key)) return false;
    seen.add(key);
    out.push(q);
    return true;
  };
  if (!spread) {
    for (const q of shuffle(candidates, rand)) {
      if (out.length >= n) break;
      take(q);
    }
    return out;
  }
  const byUnit = new Map<number, BankItem[]>();
  for (const q of shuffle(candidates, rand)) {
    const list = byUnit.get(q.unit_number) ?? [];
    list.push(q);
    byUnit.set(q.unit_number, list);
  }
  const queues = shuffle([...byUnit.values()], rand);
  while (out.length < n && queues.some((qs) => qs.length)) {
    for (const qs of queues) {
      if (out.length >= n) break;
      while (qs.length && !take(qs.shift()!)) {
        /* skip repeats */
      }
    }
  }
  return out;
}
