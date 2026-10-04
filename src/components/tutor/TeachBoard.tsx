"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Blocks, Rich } from "@/components/Rich";
import { Notes } from "@/components/Notes";
import { reportIfStale } from "@/components/stale";
import type { LessonNote, TeachQuestion } from "@/lib/lesson";
import { sendHomework, setOutcome } from "@/lib/lesson-actions";

/**
 * The lesson itself, on a screen the student is looking at too: one question at a time, large, with
 * nothing on the page that gives the answer away. The tutor marks each one as they go.
 */
export function TeachBoard({
  lessonId,
  questions,
  notes,
  studentFirstName,
  today,
  homeworkSent,
}: {
  lessonId: string;
  questions: TeachQuestion[];
  /** The lesson's revision notes, one entry per unit, gone through before the questions. */
  notes: LessonNote[];
  studentFirstName: string;
  /** Today in Singapore, so a date held for later can be told from one that is already here. */
  today: string;
  homeworkSent: boolean;
}) {
  const withNotes = notes.filter((n) => n.body);
  const [showing, setShowing] = useState<"revision" | "questions">(withNotes.length ? "revision" : "questions");
  const [part, setPart] = useState(0);
  const [at, setAt] = useState(0);
  const [outcomes, setOutcomes] = useState<Record<string, "right" | "wrong" | null>>(
    Object.fromEntries(questions.map((q) => [q.id, q.outcome])),
  );
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<string | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const [sendOn, setSendOn] = useState("");
  const [withReview, setWithReview] = useState(true);
  const [dropped, setDropped] = useState<string[]>([]);
  const [sent, setSent] = useState(homeworkSent);
  // The student is watching this screen, so what to set for homework stays out of sight until the
  // lesson is over and the tutor asks for it.
  const [ended, setEnded] = useState(false);
  const [note, setNote] = useState<string | null>(null);
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

  function go(to: number) {
    setAt(Math.max(0, Math.min(questions.length - 1, to)));
    setPicked(null);
    setShown(null);
  }

  function check() {
    if (!q || !picked || !q.right) return;
    setShown(q.id);
    mark(picked === q.right ? "right" : "wrong", false);
  }

  function mark(outcome: "right" | "wrong", move = true) {
    const next = outcomes[q!.id] === outcome && move ? null : outcome;
    setOutcomes((o) => ({ ...o, [q!.id]: next }));
    start(async () => {
      try {
        await setOutcome(lessonId, q!.id, next);
        router.refresh();
      } catch (e) {
        if (!reportIfStale(e)) throw e;
      }
    });
    if (move && next && at < questions.length - 1) setTimeout(() => setAt((i) => Math.min(i + 1, questions.length - 1)), 250);
  }

  const done = questions.filter((x) => outcomes[x.id]).length;
  const leftQs = questions.filter((x) => !outcomes[x.id]);
  const left = leftQs.length;
  const chosen = leftQs.filter((x) => !dropped.includes(x.id));
  return (
    <div className="teach">
      {tabs}
      <div className="teachbar">
        <span className="rowacts">
          <button type="button" className="btn ghost sm" onClick={() => go(at - 1)} disabled={at === 0}>
            ‹
          </button>
          <span className="pos">
            {q.n} / {questions.length}
          </span>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => go(at + 1)}
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
              onClick={() => go(i)}
            />
          ))}
        </span>
        <span className="rowacts">
          <span className="muted" style={{ fontSize: 14 }}>
            {done} of {questions.length} marked
          </span>
          {!ended && (
            <button type="button" className="btn ghost sm" onClick={() => setEnded(true)}>
              End the lesson
            </button>
          )}
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
          <>
            <ol className="choices readback picking">
              {q.options.map((o) => {
                const letter = o.id.toUpperCase();
                const open = shown === q.id;
                const isRight = open && q.right === letter;
                const isWrong = open && picked === letter && q.right !== letter;
                return (
                  <li key={o.id} className={`choice${picked === letter ? " picked" : ""}${isRight ? " right" : ""}${isWrong ? " wrong" : ""}`}>
                    <button type="button" className="pick" onClick={() => setPicked(letter)} disabled={open}>
                      <span className="k">{letter}</span>
                      <span className="grow">{o.text}</span>
                      {isRight && <span className="tag good">Right</span>}
                      {isWrong && <span className="tag bad">Not this one</span>}
                    </button>
                  </li>
                );
              })}
            </ol>
            {q.right && shown !== q.id && (
              <div className="rowacts">
                <button type="button" className="btn" disabled={!picked || pending} onClick={() => check()}>
                  Check the answer
                </button>
                {!picked && <span className="muted" style={{ fontSize: 14 }}>Choose an option first.</span>}
              </div>
            )}
          </>
        )}
        {q.outline && (
          <details className="outline">
            <summary>Model answer outline</summary>
            <p className="outlegend">
              <span className="key must">must be said</span>
              <span className="key bonus">lifts it above a pass</span>
            </p>
            <Notes text={q.outline} />
          </details>
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

      {ended && left > 0 && !sent && (
        <section className="card cardbody stack" style={{ gap: 10 }}>
          <div className="card-hd" style={{ padding: 0, border: 0 }}>
            <h2 style={{ fontSize: 17 }}>Send the rest to {studentFirstName}</h2>
            <span className="rowacts">
              <span className="muted" style={{ fontSize: 14 }}>
                {chosen.length} of {left} chosen
              </span>
              <button type="button" className="btn ghost sm" onClick={() => setEnded(false)}>
                Back to the questions
              </button>
            </span>
          </div>
          <div className="picknums">
            {leftQs.map((x) => (
              <button
                key={x.id}
                type="button"
                className={`num${dropped.includes(x.id) ? "" : " on"}`}
                aria-pressed={!dropped.includes(x.id)}
                onClick={() => setDropped((d) => (d.includes(x.id) ? d.filter((y) => y !== x.id) : [...d, x.id]))}
                title={x.prompt.slice(0, 90)}
              >
                {x.n}
                <span className="m">{x.marks}m</span>
              </button>
            ))}
          </div>
          <div className="rowacts" style={{ flexWrap: "wrap" }}>
            <label className="opt">
              <input type="checkbox" checked={withReview} onChange={(e) => setWithReview(e.target.checked)} />
              <span>Add the review quiz too</span>
            </label>
            <label className="opt" style={{ gap: 6 }}>
              <span className="muted" style={{ fontSize: 13 }}>Send on</span>
              <input type="date" className="in sm" value={sendOn} min={today} onChange={(e) => setSendOn(e.target.value)} />
            </label>
            <button
              type="button"
              className="btn accent"
              disabled={pending || chosen.length === 0}
              onClick={() =>
                start(async () => {
                  try {
                    const res = await sendHomework(lessonId, withReview, null, sendOn || null, chosen.map((x) => x.id));
                    setNote(res.error ?? res.ok ?? null);
                    if (!res.error) setSent(true);
                    router.refresh();
                  } catch (e) {
                    if (!reportIfStale(e)) throw e;
                    setNote("This page is out of date. Refresh and try again.");
                  }
                })
              }
            >
              {pending ? "Sending…" : sendOn && sendOn > today ? `Hold until ${sendOn}` : "Send as homework"}
            </button>
            {note && <span className={`formmsg ${note.includes("already") ? "bad" : "good"}`}>{note}</span>}
          </div>
        </section>
      )}
      {ended && sent && (
        <p className="formmsg good">
          The homework has gone to {studentFirstName}.{" "}
          <button type="button" className="link" onClick={() => setEnded(false)}>
            Back to the questions
          </button>
        </p>
      )}
      {ended && left === 0 && !sent && (
        <p className="muted" style={{ textAlign: "center" }}>
          Every question was marked. There is nothing left to set.{" "}
          <button type="button" className="link" onClick={() => setEnded(false)}>
            Back to the questions
          </button>
        </p>
      )}
      {sent && note && <p className="formmsg good">{note}</p>}
    </div>
  );
}
