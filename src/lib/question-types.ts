import type { BankQuestion } from "./admin";

/**
 * A lesson asks five kinds of question, in this order: a multiple-choice warm-up, the definitions,
 * the short answers and calculations, the diagrams, and one essay set at the end. The kinds are
 * fixed so that every lesson looks the same from the student's side; only the counts move with what
 * the papers ask of the unit.
 */
export type QType = "mcq" | "definition" | "short" | "diagram" | "essay";

export const Q_TYPES: QType[] = ["mcq", "definition", "short", "diagram", "essay"];

export const TYPE_LABEL: Record<QType, string> = {
  mcq: "Multiple choice",
  definition: "Definition",
  short: "Short answer",
  diagram: "Diagram",
  essay: "Essay",
};

/** Which of the five a question is. A question that asks for a diagram is a diagram question. */
export function typeOf(q: BankQuestion): QType {
  if (q.format === "mcq") return "mcq";
  if (q.marks >= 10) return "essay";
  if (q.command_term === "define") return "definition";
  if (q.diagram_type || /\b(diagram|sketch|draw|curve)\b/i.test(q.prompt)) return "diagram";
  return "short";
}

/**
 * A review quiz sorts questions a little more finely than a lesson does. A lesson counts
 * calculations with the short answers, but after the lesson "can they do the arithmetic" and "can
 * they explain the mechanism" are different holes, and a quiz meant to check that last week closed
 * should be able to ask for one of each (Jin, 2026-10-08). Essays are never in a review quiz.
 */
export type ReviewKind = "mcq" | "definition" | "short" | "calculation" | "diagram";

export const REVIEW_KINDS: ReviewKind[] = ["mcq", "definition", "short", "calculation", "diagram"];

/** What a review quiz asks unless the tutor says otherwise: nothing that takes long to answer. */
export const REVIEW_DEFAULT_KINDS: ReviewKind[] = ["mcq", "definition", "short", "calculation"];
/** Five is a lesson's opening check; the Prepare screen offers more. */
export const REVIEW_DEFAULT_SIZE = 5;

export const KIND_LABEL: Record<ReviewKind, string> = {
  mcq: "Multiple choice",
  definition: "Definition",
  short: "Short answer",
  calculation: "Calculation",
  diagram: "Diagram",
};

/** Which kind a review quiz would ask this as, or null for an essay, which it never asks. */
export function reviewKindOf(q: BankQuestion): ReviewKind | null {
  const t = typeOf(q);
  if (t === "essay") return null;
  if (t !== "short") return t;
  return q.format === "calculation" || q.command_term === "calculate" ? "calculation" : "short";
}

/**
 * Where a practice question comes from. The IB sets no multiple choice in Economics, so a set
 * restricted to the papers has none — the tutor is told rather than quietly given fewer.
 */
export type QSource = "past" | "made" | "either";

export const SOURCE_LABEL: Record<QSource, string> = {
  past: "Past papers",
  made: "Unit tests",
  either: "Either",
};

export const isPastSource = (source: string) => source === "past";
