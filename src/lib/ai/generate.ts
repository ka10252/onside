import "server-only";
import { randomBytes } from "node:crypto";
import { all, one, run } from "../db";
import { generateJson } from "./index";

/** Models sometimes return {point, marks} objects instead of strings. */
export function pointText(p: unknown): string {
  if (typeof p === "string") return p;
  if (p && typeof p === "object") {
    const o = p as Record<string, unknown>;
    const text = [o.point, o.text, o.description, o.criterion].find((x) => typeof x === "string") as string | undefined;
    const marks = typeof o.marks === "number" ? ` [${o.marks}]` : "";
    return `${text ?? JSON.stringify(o)}${text && !/\[\d+\]$/.test(text) ? marks : ""}`;
  }
  return String(p);
}

type HintCheck = { leak: boolean; hint1: string; hint2: string };
const isHintCheck = (v: unknown): v is HintCheck =>
  typeof v === "object" && v !== null && typeof (v as HintCheck).leak === "boolean" && typeof (v as HintCheck).hint1 === "string";

/** Hints must not give the answer away. The light model checks and rewrites once. */
async function safeHints(prompt: string, reference: string, hints: [string, string]): Promise<[string, string]> {
  try {
    const res = await generateJson(
      {
        task: "leak",
        temperature: 0,
        turns: [
          {
            role: "user",
            text: `A student sees these two hints for a question. Hints may name the concept, formula, diagram or data to use and the order of steps. They must NOT state the answer, a definition being asked for, a calculation result, or marking-point wording.
QUESTION: ${prompt}
ANSWER / MARKING POINTS: ${reference}
HINT 1: ${hints[0]}
HINT 2: ${hints[1]}
If either hint breaks the rule, rewrite both (1–2 short sentences each, no answer). Otherwise return them unchanged.
Return {"leak": true|false, "hint1": "...", "hint2": "..."}`,
          },
        ],
      },
      isHintCheck,
    );
    return res.hint1 && res.hint2 ? [res.hint1, res.hint2] : hints;
  } catch {
    return hints;
  }
}

// New IB-style questions for a unit (docs/ai-prompts.md 6). They start as drafts (approved_by_tutor = 0);
// saving a set that contains them is Jin's approval. Past-paper text is never sent as a model to copy.

type GenFormat = "mcq" | "short_answer" | "calculation" | "essay";

type GenQuestion = {
  format: GenFormat;
  section: string;
  command_term: string;
  marks: number;
  prompt: string;
  hints: [string, string];
  targets: string;
  options?: { id: string; text: string; misconception: string | null }[];
  answer?: string | { value: number; unit: string; tolerance?: number; working: string };
  marking_points?: string[];
  model_answer_note?: string;
  table?: { caption?: string; columns: string[]; rows: string[][] };
  marking?: { type: "bands"; rubric: string; key_content: string[]; evaluation_angles?: string[] };
  plan_prompts?: string[];
};

const isArr = (v: unknown): v is { questions: GenQuestion[] } =>
  typeof v === "object" && v !== null && Array.isArray((v as { questions?: unknown }).questions);

const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((w) => w.length > 3));
function similarity(a: string, b: string) {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const w of A) if (B.has(w)) n++;
  return n / Math.min(A.size, B.size);
}

function valid(q: GenQuestion, sections: Set<string>): string | null {
  if (!["mcq", "short_answer", "calculation", "essay"].includes(q.format)) return "format";
  if (!sections.has(q.section)) return "section";
  if (typeof q.prompt !== "string" || q.prompt.length < 15) return "prompt";
  if (!Array.isArray(q.hints) || q.hints.length !== 2 || q.hints.some((h) => typeof h !== "string" || !h)) return "hints";
  if (!Number.isInteger(q.marks) || q.marks < 1 || q.marks > 15) return "marks";
  if (q.format === "essay") {
    if (![10, 15].includes(q.marks)) return "marks";
    if (!q.marking || !Array.isArray(q.marking.key_content) || !q.marking.key_content.length || typeof q.marking.rubric !== "string") return "marking";
  }
  if (q.table && (!Array.isArray(q.table.columns) || !Array.isArray(q.table.rows))) return "table";
  if (q.format === "mcq") {
    if (!Array.isArray(q.options) || q.options.length !== 4) return "options";
    if (typeof q.answer !== "string" || !q.options.some((o) => o.id === q.answer)) return "answer";
  }
  if (q.format === "calculation") {
    const a = q.answer as { value?: unknown; unit?: unknown } | undefined;
    if (!a || typeof a.value !== "number" || !Number.isFinite(a.value) || typeof a.unit !== "string") return "answer";
    if (!Array.isArray(q.marking_points) || !q.marking_points.length) return "marking";
  }
  if (q.format === "short_answer" && (!Array.isArray(q.marking_points) || !q.marking_points.length)) return "marking";
  return null;
}

export async function generateForUnit(unitNumber: number, count: number, formats: GenFormat[]): Promise<string[]> {
  const unit = await one<{ id: string; number: number; title: string }>("SELECT id, number, title FROM units WHERE number = ?", unitNumber);
  if (!unit) return [];
  const [sections, concepts, styleRows, pastRows] = await Promise.all([
    all<{ id: string; title: string }>("SELECT id, title FROM sections WHERE unit_id = ? ORDER BY sort", unit.id),
    all<{ term: string; definition: string }>(
      "SELECT term, definition FROM concepts WHERE unit_id = ? AND definition IS NOT NULL ORDER BY seq LIMIT 60",
      unit.id,
    ),
    all<{ data: string }>("SELECT data FROM questions WHERE source = 'original' AND format IN ('mcq','short_answer','calculation') ORDER BY seq LIMIT 3"),
    all<{ prompt: string }>("SELECT prompt FROM questions WHERE unit_id = ? AND source = 'past'", unit.id),
  ]);
  const styleRefs = styleRows.map((r) => r.data);

  const res = await generateJson(
    {
      task: "generate",
      temperature: 0.7,
      turns: [
        {
          role: "user",
          text: `Write ${count} new IB Economics HL questions for Unit ${unit.number}: ${unit.title}.
Rules:
- Formats to use (mix them): ${formats.join(", ")}.
- Fictional country and currency names; new numbers. Do not reuse or reword any IB past-paper question.
- Each question tests one section below; use a real IB command term (define, explain, calculate, identify, outline, distinguish).
- Two hints: hint 1 names the concept, diagram or formula to use; hint 2 gives the chain of reasoning or method steps. Hints never give the answer, never define a term the question asks about, and never state a result.
- MCQ: 4 options with ids a–d, exactly one correct; every wrong option has a one-sentence "misconception".
- Calculation: give "answer" {value, unit, tolerance, working}. Verify the arithmetic step by step before answering. Keep numbers simple.
- Short answer (definitions, 2–4 mark explanations): "marking_points" as plain strings ending in [n] marks, and "model_answer_note".
- "marking_points" is always an array of strings.
- Essay (IB Paper 1 style): (a) "explain" for 10 marks or (b) "evaluate/discuss/to what extent" with real-world examples for 15 marks. Give "marking": {"type":"bands","rubric":"<what the bands reward>","key_content":[...],"evaluation_angles":[...]} and "plan_prompts": 4–5 short planning prompts.
- Optional "table": {"caption","columns":[...],"rows":[[...]]} (all strings) when a question needs data.
- "targets": short note for the tutor on what the question checks.
- Plain English, sentence case.
Sections:
${sections.map((s) => `${s.id} ${s.title}`).join("\n")}
Concepts from the tutor's notes:
${concepts.map((c) => `- ${c.term}: ${c.definition}`).join("\n").slice(0, 4000)}
Style references (same JSON shape, different unit):
${styleRefs.join("\n")}
Return JSON: {"questions": [{"format","section","command_term","marks","prompt","hints":[h1,h2],"targets","options"?,"answer"?,"marking_points"?,"model_answer_note"?}]}`,
        },
      ],
    },
    isArr,
  );

  const sectionIds = new Set(sections.map((s) => s.id));
  const pastPrompts = pastRows.map((r) => r.prompt);
  const ids: string[] = [];
  for (const raw of res.questions.slice(0, count)) {
    const q = { ...raw, marking_points: Array.isArray(raw.marking_points) ? raw.marking_points.map(pointText) : raw.marking_points };
    if (valid(q, sectionIds)) continue;
    if (pastPrompts.some((p) => similarity(p, q.prompt) > 0.6)) continue; // too close to a past paper
    const reference =
      q.format === "mcq"
        ? `Correct option ${q.answer}`
        : q.format === "calculation"
          ? `${JSON.stringify(q.answer)} ${q.marking_points?.join("; ")}`
          : q.format === "essay"
            ? q.marking?.key_content.map(pointText).join("; ") ?? ""
            : `${q.marking_points?.join("; ")} ${q.model_answer_note ?? ""}`;
    q.hints = await safeHints(q.prompt, reference, q.hints);
    const id = `ai-${unit.number}-${randomBytes(4).toString("hex")}`;
    const data = {
      id,
      format: q.format,
      section: q.section,
      concepts: [],
      command_term: q.command_term,
      marks: q.marks,
      prompt: q.prompt,
      hints: q.hints,
      targets: q.targets ?? "",
      source: "ai",
      approved_by_tutor: false,
      ...(q.format === "mcq" ? { options: q.options, answer: q.answer } : {}),
      ...(q.format === "calculation"
        ? { answer: { ...(q.answer as object), tolerance: (q.answer as { tolerance?: number }).tolerance }, marking_points: q.marking_points }
        : {}),
      ...(q.format === "short_answer" ? { marking_points: q.marking_points, model_answer_note: q.model_answer_note } : {}),
      ...(q.format === "essay"
        ? {
            paper_style: q.marks === 15 ? "P1(b)" : "P1(a)",
            marking: { ...q.marking, key_content: q.marking!.key_content.map(pointText), evaluation_angles: (q.marking!.evaluation_angles ?? []).map(pointText) },
            plan_prompts: Array.isArray(q.plan_prompts) ? q.plan_prompts.map(String) : [],
          }
        : {}),
      ...(q.table ? { table: { caption: q.table.caption, columns: q.table.columns.map(String), rows: q.table.rows.map((r) => r.map(String)) } } : {}),
    };
    await run(
      `INSERT INTO questions (id, unit_id, section_id, format, command_term, marks, prompt, data, source, approved_by_tutor)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ai', 0)`,
      id,
      unit.id,
      q.section,
      q.format,
      q.command_term,
      q.marks,
      q.prompt,
      JSON.stringify(data),
    );
    ids.push(id);
  }
  return ids;
}
