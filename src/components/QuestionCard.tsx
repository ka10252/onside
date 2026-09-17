import type { Checklist, Concept, OnsideQuestion as Question } from "@/lib/content";
import { FORMAT_LABEL } from "@/lib/format";
import { HintEditor } from "./HintEditor";
import { Blocks } from "./Rich";
import { tableBlock } from "@/lib/content";

// Tutor-side view of a bank question: prompt, answer / marking, hints, targets.
export function QuestionCard({
  q,
  concepts,
  checklists,
}: {
  q: Question;
  concepts: Map<string, Concept>;
  checklists: Map<string, Checklist>;
}) {
  return (
    <article className="card qc" id={q.id}>
      <div className="ch">
        <div className="meta">
          <span className="pill gray">{FORMAT_LABEL[q.format]}</span>
          {q.paper_style && <span>{q.paper_style}</span>}
          <span>{q.section}</span>
          <span>
            {q.command_term} · {q.marks} {q.marks === 1 ? "mark" : "marks"}
          </span>
        </div>
        <span className="muted" style={{ fontSize: 13 }}>{q.id}</span>
      </div>
      {q.table && <Blocks blocks={tableBlock(q.table)} />}
      <p className="qtext">{q.prompt}</p>
      <Answer q={q} checklists={checklists} />
      <HintEditor questionId={q.id} hints={q.hints} />
      <dl className="kv">
        <dt>Concepts</dt>
        <dd>{q.concepts.map((c) => concepts.get(c)?.term ?? c).join(" · ")}</dd>
      </dl>
      <div className="why">
        <b>Targets</b>
        <p>{q.targets}</p>
      </div>
    </article>
  );
}

function Answer({ q, checklists }: { q: Question; checklists: Map<string, Checklist> }) {
  switch (q.format) {
    case "mcq":
      return (
        <ul className="opts">
          {q.options.map((o) => (
            <li key={o.id} className={o.id === q.answer ? "right" : undefined}>
              <span className="k">{o.id.toUpperCase()}</span>
              <span>{o.text}</span>
            </li>
          ))}
        </ul>
      );
    case "calculation": {
      const parts = "parts" in q.answer ? q.answer.parts : [{ label: "", ...q.answer }];
      return (
        <>
          {parts.map((p, i) => (
            <p key={i} className="ansline">
              Answer {p.label}
              <span>
                {p.value} {p.unit}
              </span>
              {p.working && <span style={{ color: "var(--ink2)", fontWeight: 400 }}>{p.working}</span>}
            </p>
          ))}
          <Points items={q.marking_points} />
        </>
      );
    }
    case "analysis_chain": {
      const byId = new Map(q.steps.map((s) => [s.id, s]));
      const distractors = q.steps.filter((s) => s.distractor);
      return (
        <>
          <ol className="chain">
            {q.answer.map((id) => (
              <li key={id}>{byId.get(id)?.text}</li>
            ))}
          </ol>
          {distractors.length > 0 && (
            <p className="ansline">Does not belong: {distractors.map((d) => d.text).join(" · ")}</p>
          )}
        </>
      );
    }
    case "diagram": {
      const list = checklists.get(q.diagram_checklist);
      return (
        <>
          <dl className="kv">
            <dt>Diagram</dt>
            <dd>{q.marking.diagram_must_show}</dd>
            <dt>Explanation</dt>
            <dd>{q.marking.explanation_must_include}</dd>
            {q.marking.cap && (
              <>
                <dt>Cap</dt>
                <dd>{q.marking.cap}</dd>
              </>
            )}
          </dl>
          {list && <Points title={`Checklist: ${list.name}`} items={list.items} />}
        </>
      );
    }
    case "short_answer":
      return q.marking ? <Bands m={q.marking} /> : <Points items={q.marking_points ?? []} />;
    case "essay":
      return <Bands m={q.marking} />;
  }
}

function Points({ items, title = "Marking points" }: { items: string[]; title?: string }) {
  return (
    <div>
      <h3 style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600, color: "var(--ink2)" }}>{title}</h3>
      <ul className="summary">
        {items.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>
    </div>
  );
}

function Bands({ m }: { m: Extract<Question, { format: "essay" }>["marking"] }) {
  return (
    <>
      <p className="ansline">Rubric: {m.rubric}</p>
      <Points title="Key content" items={m.key_content} />
      {m.evaluation_angles && <Points title="Evaluation" items={m.evaluation_angles} />}
    </>
  );
}
