// Pure marking helpers (docs/scoring-rules.md). No DB access, so they are unit-tested directly.

// Every answer is checked once, when the student submits the whole set (Jin, 2026-09-17).
export const HELPER_LOCK_MS = 90_000;
export const SNAPSHOT_MS = 20_000;

// Thresholds are starting values (docs/scoring-rules.md): make them config later.
export const FLAG_PASTE_CHARS = 40;
export const FLAG_AWAY_MS = 60_000;

export const HINT_CAP = [1, 0.9, 0.7] as const;

export function hintCap(level: number): number {
  return HINT_CAP[Math.max(0, Math.min(2, level))];
}

/** "−1,234.5 %" -> -1234.5. Returns null when there is no number. */
export function parseNumber(raw: string): number | null {
  const cleaned = raw
    .replace(/[−–—]/g, "-")
    .replace(/(\d)[,\s](?=\d{3}\b)/g, "$1")
    .replace(/[^\d.\-]/g, " ")
    .trim();
  const m = cleaned.match(/-?\s*\d*\.?\d+/);
  if (!m) return null;
  const n = Number(m[0].replace(/\s/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function withinTolerance(value: number, expected: number, tolerance?: number): boolean {
  const tol = tolerance ?? Math.max(0.01, Math.abs(expected) * 0.005);
  return Math.abs(value - expected) <= tol + 1e-9;
}

export type CalcPart = { label: string; value: number; tolerance?: number };

export function checkCalculation(parts: CalcPart[], answers: string[]): { correct: boolean; partCorrect: boolean[] } {
  const partCorrect = parts.map((p, i) => {
    const n = parseNumber(answers[i] ?? "");
    return n !== null && withinTolerance(n, p.value, p.tolerance);
  });
  return { correct: partCorrect.every(Boolean), partCorrect };
}

/**
 * Analysis chain: the student orders the steps they keep and leaves out the ones that don't belong.
 * Credit per correct adjacent pair; full marks only for the exact chain.
 */
export function scoreChain(answer: string[], chosen: string[], marks: number): { correct: boolean; marks: number } {
  const correct = answer.length === chosen.length && answer.every((id, i) => chosen[i] === id);
  if (correct) return { correct, marks };
  const pairs = new Set(answer.slice(1).map((id, i) => `${answer[i]}>${id}`));
  const hit = chosen.slice(1).filter((id, i) => pairs.has(`${chosen[i]}>${id}`)).length;
  const possible = Math.max(1, answer.length - 1);
  return { correct, marks: Math.floor((hit / possible) * marks) };
}

export type Flag = "paste" | "tab_away";

export function flagsFor(pasteChars: number, awayMs: number): Flag[] {
  const flags: Flag[] = [];
  if (pasteChars >= FLAG_PASTE_CHARS) flags.push("paste");
  if (awayMs >= FLAG_AWAY_MS) flags.push("tab_away");
  return flags;
}

export type HelpCategory = "without_ai" | "with_ai" | "unverified";

export function helpCategory(hintLevel: number, aiQuestions: number, flags: string[]): HelpCategory {
  if (hintLevel > 0 || aiQuestions > 0) return "with_ai";
  if (flags.length > 0) return "unverified";
  return "without_ai";
}

export function helperUnlockAt(firstViewedAt: string): number {
  return new Date(firstViewedAt).getTime() + HELPER_LOCK_MS;
}
