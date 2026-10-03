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
