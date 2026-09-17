export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export const FORMAT_LABEL: Record<string, string> = {
  mcq: "MCQ",
  short_answer: "Short answer",
  calculation: "Calculation",
  diagram: "Diagram",
  analysis_chain: "Analysis chain",
  essay: "Essay",
};
