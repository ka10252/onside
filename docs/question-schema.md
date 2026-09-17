# Question and unit pack schema

Reference implementation: `content/units/16-exchange-rates-bop.json`. Types below are TypeScript-style for clarity.

## Unit pack

```ts
type UnitPack = {
  unit: { id: string; number: number; part: Part; title: string;
          sections: { id: string; title: string }[];
          linked_units: { unit: number; why: string }[]; exam_weight: string };
  source: { concepts: string; questions: "original" | string; status: string };
  note_corrections: { where: string; issue: string }[];   // errors found in Jin's notes
  concepts: Concept[];
  diagram_checklists: DiagramChecklist[];
  questions: Question[];
  related_past_items: Record<string, string[]>;           // ids from exam-questions-index.csv
};
type Part = "Micro" | "Macro" | "Global economy" | "Economic development";
type Concept = { id: string; section: string; term: string; definition: string };
type DiagramChecklist = { id: string; name: string; items: string[]; common_errors: string[] };
```

## Question (all formats share these)

```ts
type Base = {
  id: string;                    // q{unit}-{format}-{n}
  format: "mcq" | "short_answer" | "calculation" | "diagram" | "analysis_chain" | "essay";
  paper_style?: "P1(a)" | "P1(b)" | "P2" | "P3";
  section: string;               // "16.1"
  concepts: string[];            // concept ids — drive concept status and review
  command_term: string;          // IB command term
  marks: number;
  prompt: string;
  hints: [string, string];       // Hint 1: which concept/diagram. Hint 2: chain of analysis. Never the answer.
  targets: string;               // shown to tutor as "Targets: …"
  source?: "original" | "jin" | { past_item: string };   // past_item = pointer only
  approved_by_tutor?: boolean;   // generated questions start false
};
```

## Format-specific fields

| Format | Extra fields | Marking |
|---|---|---|
| `mcq` | `options: {id, text, misconception: string \| null}[]`, `answer` | Auto. Wrong option's `misconception` feeds the concept log. |
| `short_answer` | `marking_points: string[]` (definitions, short explains) or `marking: {type:"bands", key_content[], rubric, reference}` (P1(a)); optional `plan_prompts` | AI suggests → tutor confirms |
| `calculation` | `answer: {value, unit, tolerance, working}` or `{parts: [...]}`, `marking_points` | Final value auto (within tolerance); working marks AI → tutor |
| `diagram` | `diagram_checklist` (id), `marking: {type:"levels", levels[], cap, diagram_must_show, explanation_must_include}` | Photo upload + text; AI checklist → tutor always confirms |
| `analysis_chain` | `steps: {id, text, distractor?}[]`, `answer: string[]` | Auto; partial credit per correct adjacent pair |
| `essay` | `marking: {type:"bands", rubric, key_content[], evaluation_angles[], example_suggestions[], reference}`, `plan_prompts[]` | Plan step required; AI band suggestion with quotes → tutor confirms |

## Response and event log (DB, not seed)

```ts
type Response = { id; student_id; question_id; set_id; mode: "assigned" | "review";
  attempts: { value: string; at: string; correct?: boolean }[];   // auto formats
  final_text?: string; plan_text?: string; photo_path?: string;
  ai_mark?: { marks: number; evidence: { point: string; quote: string }[]; band?: string };
  tutor_mark?: { marks: number; note?: string; confirmed_at: string };
  hint_level: 0 | 1 | 2; flags: ("paste" | "tab_away" | "fast_complete")[] };

type Event = { response_id; at: string; type:
  "view" | "helper_open" | "hint_open" | "ai_message_student" | "ai_message_helper" | "ai_refused_answer" |
  "paste" | "blur" | "focus" | "snapshot" | "attempt" | "submit"; data: Record<string, unknown> };
```
