"use client";

import { useEffect, useState } from "react";
import type { BankQuestion } from "@/lib/admin";
import { previewQuestion, type Preview, type SeenState } from "@/lib/builder-actions";
import { FORMAT_LABEL } from "@/lib/format";
import { Blocks, Rich } from "./Rich";

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-SG", { day: "numeric", month: "short" });

export function QuestionLine({ q, seen }: { q: BankQuestion; seen?: SeenState }) {
  return (
    <span className="pickbody">
      <span className="meta">
        {q.past_label && <span className="pill ink">{q.past_label}</span>}
        {q.source === "ai" && <span className="pill hl">AI-made</span>}
        {q.source === "unit-test" && <span className="pill gray">Unit test</span>}
        {seen && (
          <span className={`pill ${seen.state === "answered" ? "green" : "amber"}`} title={seen.set}>
            {seen.state === "answered" ? "Answered" : "Sent"} · {shortDate(seen.at)}
          </span>
        )}
        <span className="pill gray">{FORMAT_LABEL[q.format]}</span>
        {q.paper_style && !q.past_label && <span>{q.paper_style}</span>}
        <span>{q.section_id}</span>
        <span>
          {q.marks} {q.marks === 1 ? "mark" : "marks"}
        </span>
      </span>
      <span className="clamp">{q.prompt.replace(/\*\*/g, "")}</span>
      {q.targets && (
        <span className="muted" style={{ fontSize: 13 }}>
          {q.past_label ? "Topic" : "Targets"}: {q.targets}
        </span>
      )}
    </span>
  );
}

export function PreviewPanel({ id }: { id: string }) {
  const [p, setP] = useState<Preview | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void previewQuestion(id).then((x) => live && setP(x));
    return () => {
      live = false;
    };
  }, [id]);
  if (p === undefined) return <div className="preview muted">Loading…</div>;
  if (p === null) return <div className="preview muted">Not found.</div>;
  return (
    <div className="preview">
      {p.draft && <p className="note">AI draft · check the question and answer before you send it.</p>}
      {p.context.length > 0 && (
        <details className="sub">
          <summary>Extracts and data</summary>
          <Blocks blocks={p.context} />
        </details>
      )}
      {p.lead.length > 0 && <Blocks blocks={p.lead} />}
      <p className="qtext" style={{ margin: 0 }}>
        <Rich text={p.prompt} />
      </p>
      {p.options.length > 0 && (
        <ul className="opts">
          {p.options.map((o) => (
            <li key={o.id} className={o.right ? "right" : undefined}>
              <span className="k">{o.id.toUpperCase()}</span>
              <span>{o.text}</span>
            </li>
          ))}
        </ul>
      )}
      {p.answer && (
        <div>
          <h3 className="ph3">{p.label ? "Mark scheme" : "Answer"}</h3>
          <div className="answerbox mstext">
            <Rich text={p.answer} />
          </div>
        </div>
      )}
      {p.hints && (
        <dl className="kv">
          <dt>Hint 1</dt>
          <dd>{p.hints[0]}</dd>
          <dt>Hint 2</dt>
          <dd>{p.hints[1]}</dd>
        </dl>
      )}
    </div>
  );
}
