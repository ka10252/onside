import "server-only";
import { isPast, pastContext, type Block, type Question } from "../content";
import { hintCap } from "../grading";
import { generateJson, type ChatTurn } from "./index";

// Prompts follow docs/ai-prompts.md (1. Helper, 2. Leak check).
// Rule from Jin: the Helper never gives the answer, even when asked. It explains how to find it.

export const tableText = (t: { caption?: string; columns: string[]; rows: string[][] }) =>
  [t.caption ?? "Table", t.columns.join(" | "), ...t.rows.map((r) => r.join(" | "))].join("\n");

const blocksText = (blocks: Block[]) =>
  blocks
    .map((b) => (b.type === "text" ? b.text : b.type === "table" ? tableText(b) : `[${b.caption ?? "figure/table"}]`))
    .join("\n");

/** Everything the student must not be told. Sent to the model, never to the browser. */
export function referenceFor(q: Question): string {
  if (isPast(q)) return q.marking.text.slice(0, 5000);
  switch (q.format) {
    case "mcq": {
      const right = q.options.find((o) => o.id === q.answer);
      return `Correct option: ${q.answer.toUpperCase()} (${right?.text ?? ""})`;
    }
    case "calculation": {
      const parts = "parts" in q.answer ? q.answer.parts : [{ label: "", ...q.answer }];
      return [
        ...parts.map((p) => `Answer ${p.label}: ${p.value} ${p.unit}. Working: ${p.working ?? ""}`),
        ...q.marking_points,
      ].join("\n");
    }
    case "analysis_chain": {
      const byId = new Map(q.steps.map((s) => [s.id, s.text]));
      return `Correct order: ${q.answer.map((id) => byId.get(id)).join(" -> ")}. Not part of the chain: ${q.steps
        .filter((s) => s.distractor)
        .map((s) => s.text)
        .join("; ")}`;
    }
    case "diagram":
      return `Diagram must show: ${q.marking.diagram_must_show}\nExplanation must include: ${q.marking.explanation_must_include}`;
    case "essay":
      return [...q.marking.key_content, ...(q.marking.evaluation_angles ?? [])].join("\n");
    case "short_answer":
      return [
        ...(q.marking_points ?? []),
        ...(q.marking?.key_content ?? []),
        q.model_answer_note ?? "",
      ].join("\n");
  }
}

function questionText(q: Question, context: Block[]): string {
  if (isPast(q)) {
    const ctx = blocksText(context).slice(0, 3500);
    return `${ctx ? `Extracts and data:\n${ctx}\n\n` : ""}${q.past.lead.length ? `${blocksText(q.past.lead)}\n` : ""}${q.prompt}`;
  }
  const opts = q.format === "mcq" ? `\nOptions:\n${q.options.map((o) => `${o.id.toUpperCase()}. ${o.text}`).join("\n")}` : "";
  const steps = q.format === "analysis_chain" ? `\nSteps to order:\n${q.steps.map((s) => `- ${s.text}`).join("\n")}` : "";
  return `${q.table ? `${tableText(q.table)}\n\n` : ""}${q.prompt}${opts}${steps}`;
}

export type HelperInput = {
  q: Question;
  hints: [string, string] | null;
  hintLevel: number;
  working: string;
  history: ChatTurn[];
  message: string;
};

function systemPrompt({ q, hints, hintLevel, working }: HelperInput, context: Block[]): string {
  const opened = hints ? hints.slice(0, hintLevel) : [];
  const next =
    hints && hintLevel < 2
      ? `Hint ${hintLevel + 1} (opening it lowers the max score to ${Math.round(hintCap(hintLevel + 1) * 100)}%)`
      : "none — no hints left";
  return `You are the Onside Helper for an IB Economics HL student. Your tutor-facing log is visible to their tutor.
Rules:
- Never state the final answer, a model answer, the correct option, a full definition that is being assessed, a completed calculation result or any intermediate numeric result, or any marking point wording.
- If the student asks for the answer (in any form, including "just tell me", "is it X?", "check my answer"): do not give it and do not confirm or deny a specific answer. In one or two sentences explain HOW to find it (which concept, formula, data or next step to use), then point to the next hint: ${next}.
- Reply in 1–3 short sentences. End with a question that moves the student one step.
- No praise, no emoji, no markdown.
- Stay on this question. If asked about something else, say you can only help with this question.
- If a hint is open and the student says they don't understand it, rephrase that hint more simply without adding new content.
Question (${q.format}; command term: ${q.command_term}; marks: ${q.marks}):
${questionText(q, context)}
Hints opened: ${hintLevel}${opened.length ? `\n${opened.map((h, i) => `Hint ${i + 1}: ${h}`).join("\n")}` : ""}
Reference answer (NEVER reveal, confirm or paraphrase): ${referenceFor(q)}
Student's current working (may be empty): ${working.slice(0, 2000)}
Return JSON: {"reply": "<your reply>", "asked_for_answer": true|false}`;
}

type HelperJson = { reply: string; asked_for_answer: boolean };
const isHelperJson = (v: unknown): v is HelperJson =>
  typeof v === "object" && v !== null && typeof (v as HelperJson).reply === "string";

type LeakJson = { leak: boolean; which: string };
const isLeakJson = (v: unknown): v is LeakJson => typeof v === "object" && v !== null && typeof (v as LeakJson).leak === "boolean";

export async function leakCheck(q: Question, reply: string): Promise<LeakJson> {
  return generateJson(
    {
      task: "leak",
      temperature: 0,
      turns: [
        {
          role: "user",
          text: `Does REPLY reveal any of these: the final numeric answer or an intermediate result, the correct MCQ option, the correct order of steps, a full definition being assessed, or wording that would earn a marking point? Explaining which method, formula or data to use is allowed.
QUESTION: ${q.prompt}
REFERENCE: ${referenceFor(q)}
REPLY: ${reply}
Return {"leak": true|false, "which": "<short reason or empty>"}`,
        },
      ],
    },
    isLeakJson,
  );
}

export function refusal(hints: [string, string] | null, hintLevel: number): string {
  if (hints && hintLevel < 2) {
    return `I can't give you the answer. Work out which idea the question is testing first — Hint ${hintLevel + 1} walks through that step, but your max score would drop to ${Math.round(hintCap(hintLevel + 1) * 100)}%.`;
  }
  return "I can't give you the answer. Go back to the question: which concept or data does it point you to, and what is the first step?";
}

export type HelperResult = { reply: string; askedForAnswer: boolean; blocked: boolean };

export async function helperReply(input: HelperInput): Promise<HelperResult> {
  const turns: ChatTurn[] = [...input.history, { role: "user", text: input.message }];
  const context = isPast(input.q) ? await pastContext(input.q.past.paper, input.q.past.question) : [];
  const system = systemPrompt(input, context);
  let res = await generateJson({ task: "helper", system, turns, temperature: 0.3 }, isHelperJson);
  for (let attempt = 0; attempt < 2; attempt++) {
    const check = await leakCheck(input.q, res.reply);
    if (!check.leak) return { reply: res.reply.trim(), askedForAnswer: Boolean(res.asked_for_answer), blocked: false };
    if (attempt === 1) break;
    res = await generateJson(
      {
        task: "helper",
        system,
        temperature: 0.2,
        turns: [...turns, { role: "assistant", text: res.reply }, { role: "user", text: `Your last reply revealed ${check.which}. Try again without it.` }],
      },
      isHelperJson,
    );
  }
  return { reply: refusal(input.hints, input.hintLevel), askedForAnswer: true, blocked: true };
}
