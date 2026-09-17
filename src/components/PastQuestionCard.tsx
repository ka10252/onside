import type { Block, PastQuestion } from "@/lib/content";
import { FORMAT_LABEL } from "@/lib/format";
import { HintEditor } from "./HintEditor";
import { Blocks, Rich } from "./Rich";

// Tutor-side view of an original past-paper item.
export function PastQuestionCard({ q, context }: { q: PastQuestion; context: Block[] }) {
  return (
    <details className="card qc past" id={q.id}>
      <summary>
        <span className="meta">
          <span className="pill ink">{q.past.label}</span>
          <span className="pill gray">{FORMAT_LABEL[q.format]}</span>
          {q.section && <span>{q.section}</span>}
          <span>
            {q.command_term} · {q.marks} {q.marks === 1 ? "mark" : "marks"}
          </span>
          {q.targets && <span>{q.targets}</span>}
        </span>
        <span className="qtext clamp">
          <Rich text={q.prompt} />
        </span>
      </summary>
      <div className="stack" style={{ gap: 14 }}>
        {context.length > 0 && (
          <details className="sub">
            <summary>Extracts and data</summary>
            <Blocks blocks={context} />
          </details>
        )}
        {q.past.lead.length > 0 && <Blocks blocks={q.past.lead} />}
        <p className="qtext">
          <Rich text={q.prompt} />
        </p>
        {(q.past.diagram || q.past.secondary.length > 0) && (
          <dl className="kv">
            {q.past.diagram && (
              <>
                <dt>Diagram</dt>
                <dd>{q.past.diagram}</dd>
              </>
            )}
            {q.past.secondary.length > 0 && (
              <>
                <dt>Also uses</dt>
                <dd>{q.past.secondary.join(" · ")}</dd>
              </>
            )}
          </dl>
        )}
        <HintEditor questionId={q.id} hints={q.hints} />
        <details className="sub">
          <summary>Mark scheme</summary>
          <div className="mstext">
            <Rich text={q.marking.text || "Not found in the mark scheme file."} />
          </div>
        </details>
      </div>
    </details>
  );
}
