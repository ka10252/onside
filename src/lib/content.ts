import "server-only";
import { all, one } from "./db";

// Types follow docs/question-schema.md.
export type Format = "mcq" | "short_answer" | "calculation" | "diagram" | "analysis_chain" | "essay";

type Base = {
  id: string;
  format: Format;
  paper_style?: "P1(a)" | "P1(b)" | "P2" | "P3";
  section: string;
  concepts: string[];
  command_term: string;
  marks: number;
  prompt: string;
  hints: [string, string];
  targets: string;
  approved_by_tutor?: boolean;
  /** Data table shown above the prompt (unit tests, AI questions). */
  table?: DataTable;
};

export type DataTable = { caption?: string; columns: string[]; rows: string[][] };

export type CalcAnswer = { value: number; unit: string; tolerance?: number; working?: string };
export type BandsMarking = {
  type: "bands";
  rubric: string;
  key_content: string[];
  evaluation_angles?: string[];
  example_suggestions?: string[];
  reference?: string;
};

export type McqQuestion = Base & {
  format: "mcq";
  options: { id: string; text: string; misconception: string | null }[];
  answer: string;
};
export type ShortAnswerQuestion = Base & {
  format: "short_answer";
  marking_points?: string[];
  marking?: BandsMarking;
  model_answer_note?: string;
  plan_prompts?: string[];
};
export type CalculationQuestion = Base & {
  format: "calculation";
  answer: CalcAnswer | { parts: (CalcAnswer & { label: string })[] };
  marking_points: string[];
};
export type DiagramQuestion = Base & {
  format: "diagram";
  diagram_checklist: string;
  marking: {
    type: "levels";
    levels: { marks: string; descriptor: string }[];
    cap?: string;
    diagram_must_show: string;
    explanation_must_include: string;
  };
};
export type ChainQuestion = Base & {
  format: "analysis_chain";
  steps: { id: string; text: string; distractor?: boolean }[];
  answer: string[];
};
export type EssayQuestion = Base & { format: "essay"; marking: BandsMarking; plan_prompts: string[] };

export type OnsideQuestion =
  | McqQuestion
  | ShortAnswerQuestion
  | CalculationQuestion
  | DiagramQuestion
  | ChainQuestion
  | EssayQuestion;

export type Block =
  | { type: "text"; text: string }
  | { type: "image"; src: string; caption?: string }
  | ({ type: "table" } & DataTable);

export const tableBlock = (t: DataTable | undefined): Block[] => (t ? [{ type: "table", ...t }] : []);

/** An original IB past-paper item. Text is local only (docs/decisions.md). */
export type PastQuestion = Omit<Base, "hints" | "format"> & {
  format: Format;
  hints: [string, string] | null;
  past: {
    item: string;
    paper: string;
    question: string;
    label: string; // "M24 P2 TZ1 HLSL · Q1(b)(i)"
    lead: Block[];
    secondary: string[];
    diagram: string;
  };
  marking: { type: "past_markscheme"; text: string };
};

export type Question = OnsideQuestion | PastQuestion;

export const isPast = (q: Question): q is PastQuestion => "past" in q;

export async function pastContext(paperId: string, number: string): Promise<Block[]> {
  const row = await one<{ context: string }>("SELECT context FROM past_questions WHERE paper_id = ? AND number = ?", paperId, number);
  return row ? (JSON.parse(row.context) as Block[]) : [];
}

export type Part = { id: string; name: string };
export type Unit = {
  id: string;
  number: number;
  part_id: string;
  title: string;
  concept_extraction: string | null;
  exam_weight: string | null;
  has_pack: number;
};
export type Section = { id: string; unit_id: string; title: string };
export type Concept = { id: string; section_id: string | null; term: string; definition: string | null };
export type Checklist = { id: string; name: string; items: string[]; common_errors: string[] };

export async function listParts(): Promise<(Part & { units: (Unit & { question_count: number; past_count: number })[] })[]> {
  const parts = await all<Part>("SELECT id, name FROM parts ORDER BY sort");
  const units = await all<Unit & { question_count: number; past_count: number }>(
    `SELECT u.*,
            (SELECT COUNT(*) FROM questions q WHERE q.unit_id = u.id AND q.source <> 'past') AS question_count,
            (SELECT COUNT(*) FROM questions q WHERE q.unit_id = u.id AND q.source = 'past') AS past_count
       FROM units u ORDER BY number`,
  );
  return parts.map((p) => ({ ...p, units: units.filter((u) => u.part_id === p.id) }));
}

export async function getUnit(number: number) {
  const unit = await one<Unit>("SELECT * FROM units WHERE number = ?", number);
  if (!unit) return null;
  const [part, sections, concepts, questions, pastQuestions, checklists, corrections] = await Promise.all([
    one<Part>("SELECT id, name FROM parts WHERE id = ?", unit.part_id),
    all<Section>("SELECT id, unit_id, title FROM sections WHERE unit_id = ? ORDER BY sort", unit.id),
    all<Concept>("SELECT id, section_id, term, definition FROM concepts WHERE unit_id = ? ORDER BY section_id, seq", unit.id),
    all<{ data: string }>("SELECT data FROM questions WHERE unit_id = ? AND source <> 'past' ORDER BY seq", unit.id),
    all<{ data: string }>(
      `SELECT q.data FROM questions q JOIN past_items p ON 'pp-' || p.id = q.id
        WHERE q.unit_id = ? AND q.source = 'past'
        ORDER BY substr(p.session, 2) DESC, substr(p.session, 1, 1) DESC, p.paper, p.level, p.tz, q.seq`,
      unit.id,
    ),
    all<{ data: string }>("SELECT data FROM diagram_checklists WHERE unit_id = ?", unit.id),
    all<{ location: string; issue: string }>("SELECT location, issue FROM note_corrections WHERE unit_id = ? ORDER BY id", unit.id),
  ]);
  return {
    unit,
    part: part!,
    sections,
    concepts,
    questions: questions.map((r) => JSON.parse(r.data) as OnsideQuestion),
    pastQuestions: pastQuestions.map((r) => JSON.parse(r.data) as PastQuestion),
    checklists: checklists.map((r) => JSON.parse(r.data) as Checklist),
    corrections,
  };
}
