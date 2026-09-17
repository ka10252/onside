import { isPast, type Question } from "./content";

// Answer or mark scheme as plain text, for tutor views only.
export function answerText(q: Question): string {
  if (isPast(q)) return q.marking.text || "Not found in the mark scheme file.";
  switch (q.format) {
    case "mcq":
      return `Answer: ${q.answer.toUpperCase()}. ${q.options.find((o) => o.id === q.answer)?.text ?? ""}`;
    case "analysis_chain": {
      const byId = new Map(q.steps.map((s) => [s.id, s.text]));
      return q.answer.map((id, i) => `${i + 1}. ${byId.get(id)}`).join("\n");
    }
    case "calculation": {
      const parts = "parts" in q.answer ? q.answer.parts : [{ label: "", ...q.answer }];
      return [...parts.map((p) => `${p.label} ${p.value} ${p.unit} (${p.working ?? ""})`), ...q.marking_points].join("\n");
    }
    case "diagram":
      return `${q.marking.levels.map((l) => `${l.marks}: ${l.descriptor}`).join("\n")}\n${q.marking.cap ?? ""}\nDiagram: ${q.marking.diagram_must_show}\nExplanation: ${q.marking.explanation_must_include}`;
    case "essay":
      return `${q.marking.rubric}\n- ${q.marking.key_content.join("\n- ")}\nEvaluation:\n- ${(q.marking.evaluation_angles ?? []).join("\n- ")}`;
    case "short_answer":
      return q.marking ? `${q.marking.rubric}\n- ${q.marking.key_content.join("\n- ")}` : (q.marking_points ?? []).join("\n");
  }
}
