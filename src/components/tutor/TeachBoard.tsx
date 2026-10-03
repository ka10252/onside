"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Blocks, Rich } from "@/components/Rich";
import { Notes } from "@/components/Notes";
import { reportIfStale } from "@/components/stale";
import type { LessonNote, TeachQuestion } from "@/lib/lesson";
import { setOutcome } from "@/lib/lesson-actions";

/**
 * The lesson itself, on a screen the student is looking at too: one question at a time, large, with
 * nothing on the page that gives the answer away. The tutor marks each one as they go.
 */
export function TeachBoard({
  lessonId,
  questions,
  notes,
}: {
  lessonId: string;
  questions: TeachQuestion[];
  /** The lesson's revision notes, one entry per unit, gone through before the questions. */
  notes: LessonNote[];
}) {
  const withNotes = notes.filter((n) => n.body);
  const [showing, setShowing] = useState<"revision" | "questions">(withNotes.length ? "revision" : "questions");
  const [part, setPart] = useState(0);
  const [at, setAt] = useState(0);
  const [outcomes, setOutcomes] = useState<Record<string, "right" | "wrong" | null>>(
    Object.fromEntries(questions.map((q) => [q.id, q.outcome])),
  );
  const [pending, start] = useTransition();
  const router = useRouter();
  const q = questions[at];

  const tabs = withNotes.length ? (
    <nav className="filters" aria-label="Which part of the lesson">
      {withNotes.map((n, i) => (
        <button
          key={n.unit}
          type="button"
          className={`chip${showing === "revision" && part === i ? " on" : ""}`}
          onClick={() => {
            setShowing("revision");
            setPart(i);
          }}
        >
          {withNotes.length > 1 ? `Unit ${n.unit}` : "Revision"}
        </button>
      ))}
      <button type="button" className={`chip${showing === "questions" ? " on" : ""}`} onClick={() => setShowing("questions")}>
        Questions · {questions.length}
      </button>
    </nav>
  ) : null;

  if (showing === "revision" && withNotes.length) {
    return (
      <div className="teach">
        {tabs}
        <article className="card teachcard">
          <Notes text={withNotes[Math.min(part, withNotes.length - 1)]!.body} />
        </article>
      </div>
    );
  }
  if (!q) {
    return (
      <div className="teach">
        {tabs}
        <p className="muted">No questions in this lesson yet. Add some on the Prepare screen.</p>
      </div>
    );
  }

  function mark(outcome: "right" | "wrong") {
    const next = outcomes[q!.id] === outcome ? null : outcome;
    setOutcomes((o) => ({ ...o, [q!.id]: next }));
    start(async () => {
      try {
        await setOutcome(lessonId, q!.id, next);
        router.refresh();
      } catch (e) {
        if (!reportIfStale(e)) throw e;
      }
    });
    if (next && at < questions.length - 1) setTimeout(() => setAt((i) => Math.min(i + 1, questions.length - 1)), 250);
  }

  const done = questions.filter((x) => outcomes[x.id]).length;
  return (
    <div className="teach">
      {tabs}
      <div className="teachbar">
        <span className="rowacts">
          <button type="button" className="btn ghost sm" onClick={() => setAt((i) => Math.max(0, i - 1))} disabled={at === 0}>
            ‹
          </button>
          <span className="pos">
            {q.n} / {questions.length}
          </span>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => setAt((i) => Math.min(questions.length - 1, i + 1))}
            disabled={at === questions.length - 1}
          >
            ›
          </button>
        </span>
        <span className="dots" aria-hidden>
          {questions.map((x, i) => (
            <button
              key={x.id}
              type="button"
              className={`dot${i === at ? " on" : ""}${outcomes[x.id] === "right" ? " right" : outcomes[x.id] === "wrong" ? " wrong" : ""}`}
              onClick={() => setAt(i)}
            />
          ))}
        </span>
        <span className="muted" style={{ fontSize: 14 }}>
          {done} of {questions.length} marked
        </span>
      </div>

      <article className="card teachcard">
        <p className="meta" style={{ margin: 0 }}>
          {q.label && <span className="pill ink">{q.label}</span>}
          <span>
            {q.marks} {q.marks === 1 ? "mark" : "marks"}
          </span>
        </p>
        {q.context.length > 0 && (
          <details className="sub" open={q.marks >= 10 || /\b(text|table|figure|paragraph|extract|data)\b/i.test(q.prompt) || undefined}>
            <summary>Extracts and data</summary>
            <Blocks blocks={q.context} />
          </details>
        )}
        {q.lead.length > 0 && <Blocks blocks={q.lead} />}
        <p className="teachq">
          <Rich text={q.prompt} />
        </p>
        {q.options.length > 0 && (
          <ol className="choices readback">
            {q.options.map((o) => (
              <li key={o.id} className="choice">
                <span className="k">{o.id.toUpperCase()}</span>
                <span className="grow">{o.text}</span>
              </li>
            ))}
          </ol>
        )}
      </article>

      <div className="rowacts" style={{ justifyContent: "center" }}>
        <button type="button" className={`btn lg${outcomes[q.id] === "right" ? " primary" : ""}`} onClick={() => mark("right")} disabled={pending}>
          Got it
        </button>
        <button type="button" className={`btn lg${outcomes[q.id] === "wrong" ? " danger" : ""}`} onClick={() => mark("wrong")} disabled={pending}>
          Missed
        </button>
      </div>
    </div>
  );
}
