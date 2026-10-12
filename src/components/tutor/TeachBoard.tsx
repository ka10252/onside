"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Blocks, Rich } from "@/components/Rich";
import { Notes } from "@/components/Notes";
import { reportIfStale } from "@/components/stale";
import type { LessonNote, TeachQuestion } from "@/lib/lesson";
import {
  buildHomework,
  buildReviewQuiz,
  dropHomework,
  dropReviewQuiz,
  sendHomework,
  setOutcome,
  setReviewOutcome,
} from "@/lib/lesson-actions";
import { KIND_LABEL, REVIEW_DEFAULT_KINDS, REVIEW_DEFAULT_SIZE, REVIEW_KINDS, type ReviewKind } from "@/lib/question-types";

/**
 * The lesson itself, on a screen the student is looking at too: one question at a time, large, with
 * nothing on the page that gives the answer away. The tutor marks each one as they go.
 */
export function TeachBoard({
  lessonId,
  questions,
  review,
  notes,
  studentFirstName,
  today,
  homeworkSent,
  homeworkSetId,
  reviewSetId,
}: {
  lessonId: string;
  questions: TeachQuestion[];
  /** The review quiz built for this lesson, run at the start of the next one. */
  review: TeachQuestion[];
  /** The lesson's revision notes, one entry per unit, gone through before the questions. */
  notes: LessonNote[];
  studentFirstName: string;
  /** Today in Singapore, so a date held for later can be told from one that is already here. */
  today: string;
  homeworkSent: boolean;
  /** The set built and not yet sent, which the tutor can look at first. */
  homeworkSetId: string | null;
  /** The review quiz built for the start of the next lesson, if there is one already. */
  reviewSetId: string | null;
}) {
  const withNotes = notes.filter((n) => n.body);
  const [showing, setShowing] = useState<"revision" | "questions" | "review" | "outlines">(
    withNotes.length ? "revision" : "questions",
  );
  const [part, setPart] = useState(0);
  const [outcomes, setOutcomes] = useState<Record<string, "right" | "wrong" | null>>(
    Object.fromEntries(questions.map((q) => [q.id, q.outcome])),
  );
  const [reviewOutcomes, setReviewOutcomes] = useState<Record<string, "right" | "wrong" | null>>(
    Object.fromEntries(review.map((q) => [q.id, q.outcome])),
  );
  const [pending, start] = useTransition();
  const [sendOn, setSendOn] = useState("");
  const [dropped, setDropped] = useState<string[]>([]);
  const [sent, setSent] = useState(homeworkSent);
  const [builtId, setBuiltId] = useState(homeworkSetId);
  const [quizId, setQuizId] = useState(reviewSetId);
  const [quizSize, setQuizSize] = useState(REVIEW_DEFAULT_SIZE);
  const [quizKinds, setQuizKinds] = useState<ReviewKind[]>(REVIEW_DEFAULT_KINDS);
  // The student is watching this screen, so what to set for homework stays out of sight until the
  // lesson is over and the tutor asks for it.
  const [ended, setEnded] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const router = useRouter();

  const outlines = questions.filter((q) => q.outline);

  const tabs = withNotes.length || review.length || outlines.length ? (
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
      {review.length > 0 && (
        <button type="button" className={`chip${showing === "review" ? " on" : ""}`} onClick={() => setShowing("review")}>
          Review quiz · {review.length}
        </button>
      )}
      {outlines.length > 0 && (
        <button type="button" className={`chip${showing === "outlines" ? " on" : ""}`} onClick={() => setShowing("outlines")}>
          Model answers · {outlines.length}
        </button>
      )}
    </nav>
  ) : null;

  // The essays' outlines on their own tab. They are the tutor's, and the student is looking at this
  // screen, so nothing opens them but a deliberate click — same as the toggle under each question.
  if (showing === "outlines" && outlines.length) {
    return (
      <div className="teach">
        {tabs}
        <article className="card teachcard stack" style={{ gap: 24 }}>
          {outlines.map((q) => (
            <div key={q.id}>
              <p className="meta" style={{ margin: "0 0 8px" }}>
                {q.label && <span className="pill ink">{q.label}</span>}
                <span>
                  {q.marks} {q.marks === 1 ? "mark" : "marks"}
                </span>
              </p>
              <p className="outlegend">
                <span className="key must">must be said</span>
                <span className="key bonus">lifts it above a pass</span>
              </p>
              <Notes text={q.outline!} />
            </div>
          ))}
        </article>
      </div>
    );
  }

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
  if (showing === "review" && review.length) {
    return (
      <div className="teach">
        {tabs}
        <Run
          key="review"
          questions={review}
          outcomes={reviewOutcomes}
          pending={pending}
          onMark={(id, outcome) => {
            setReviewOutcomes((o) => ({ ...o, [id]: outcome }));
            start(async () => {
              try {
                await setReviewOutcome(lessonId, id, outcome);
                router.refresh();
              } catch (e) {
                if (!reportIfStale(e)) throw e;
              }
            });
          }}
        />
      </div>
    );
  }
  if (!questions[0]) {
    return (
      <div className="teach">
        {tabs}
        <p className="muted">No questions in this lesson yet. Add some on the Prepare screen.</p>
      </div>
    );
  }

  function act(job: () => Promise<{ error?: string; ok?: string }>) {
    start(async () => {
      try {
        const res = await job();
        setNote(res.error ?? res.ok ?? null);
        router.refresh();
      } catch (e) {
        if (!reportIfStale(e)) throw e;
        setNote("This page is out of date. Refresh and try again.");
      }
    });
  }

  function mark(id: string, outcome: "right" | "wrong" | null) {
    setOutcomes((o) => ({ ...o, [id]: outcome }));
    start(async () => {
      try {
        await setOutcome(lessonId, id, outcome);
        router.refresh();
      } catch (e) {
        if (!reportIfStale(e)) throw e;
      }
    });
  }

  const wrong = questions.filter((x) => outcomes[x.id] === "wrong").length;
  const leftQs = questions.filter((x) => !outcomes[x.id]);
  const left = leftQs.length;
  const chosen = leftQs.filter((x) => !dropped.includes(x.id));
  return (
    <div className="teach">
      {tabs}
      <Run
        key="lesson"
        questions={questions}
        outcomes={outcomes}
        pending={pending}
        onMark={mark}
        barEnd={
          !ended ? (
            <button type="button" className="btn ghost sm" onClick={() => setEnded(true)}>
              End the lesson
            </button>
          ) : null
        }
      />

      {ended && (
        <section className="card cardbody stack" style={{ gap: 10 }}>
          <div className="card-hd" style={{ padding: 0, border: 0 }}>
            <h2 style={{ fontSize: 17 }}>Homework for {studentFirstName}</h2>
            <span className="rowacts">
              <span className="muted" style={{ fontSize: 14 }}>
                {sent ? "sent" : builtId ? "built, not sent" : `${chosen.length} of ${left} chosen`}
              </span>
              <button type="button" className="btn ghost sm" onClick={() => setEnded(false)}>
                Back to the questions
              </button>
            </span>
          </div>

          {sent ? (
            <p className="formmsg good" style={{ margin: 0 }}>The homework has gone to {studentFirstName}.</p>
          ) : left === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              Every question was marked, so there is nothing left to set.
            </p>
          ) : builtId ? (
            <>
              <p className="muted" style={{ margin: 0, fontSize: 14 }}>
                Look at it the way {studentFirstName} will, then choose the day.
              </p>
              <div className="rowacts" style={{ flexWrap: "wrap" }}>
                <a className="btn" href={`/tutor/sets/${builtId}/preview`} target="_blank" rel="noreferrer">
                  See it as {studentFirstName} will
                </a>
                <label className="opt" style={{ gap: 6 }}>
                  <span className="muted" style={{ fontSize: 13 }}>Send on</span>
                  <input type="date" className="in sm" value={sendOn} min={today} onChange={(e) => setSendOn(e.target.value)} />
                </label>
                <button
                  type="button"
                  className="btn accent"
                  disabled={pending}
                  onClick={() =>
                    act(async () => {
                      const res = await sendHomework(lessonId, null, sendOn || null);
                      if (!res.error) setSent(true);
                      return res;
                    })
                  }
                >
                  {pending ? "Sending…" : sendOn && sendOn > today ? `Hold until ${sendOn}` : "Send it"}
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={pending}
                  onClick={() =>
                    act(async () => {
                      const res = await dropHomework(lessonId);
                      if (!res.error) setBuiltId(null);
                      return res;
                    })
                  }
                >
                  Choose again
                </button>
              </div>
            </>
          ) : (
            <>
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
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                {chosen.length < 5
                  ? `Fewer than five, so ${5 - chosen.length} more will be added on the same ground as what went wrong.`
                  : "Hints and the helper are on, as in daily practice."}
              </p>
              <div className="rowacts">
                <button
                  type="button"
                  className="btn accent"
                  disabled={pending || chosen.length === 0}
                  onClick={() =>
                    act(async () => {
                      const res = await buildHomework(lessonId, chosen.map((x) => x.id));
                      if (res.setId) setBuiltId(res.setId);
                      return res;
                    })
                  }
                >
                  {pending ? "Building…" : "Build it"}
                </button>
                <span className="muted" style={{ fontSize: 13 }}>Nothing is sent yet: you look at it first.</span>
              </div>
            </>
          )}
          {note && <span className={`formmsg ${note.includes("already") || note.includes("No ") ? "bad" : "good"}`}>{note}</span>}
        </section>
      )}

      {ended && (
        <section className="card cardbody stack" style={{ gap: 10 }}>
          <div className="card-hd" style={{ padding: 0, border: 0 }}>
            <h2 style={{ fontSize: 17 }}>Review quiz for next time</h2>
            <span className="muted" style={{ fontSize: 14 }}>
              {quizId ? "built" : `${wrong} marked wrong`}
            </span>
          </div>
          {quizId ? (
            <>
              <p className="muted" style={{ margin: 0, fontSize: 14 }}>
                It is waiting on the Review quiz tab. Open it at the start of the next lesson.
              </p>
              <div className="rowacts" style={{ flexWrap: "wrap" }}>
                <a className="btn ghost sm" href={`/tutor/sets/${quizId}/preview`} target="_blank" rel="noreferrer">
                  Look at it
                </a>
                <button
                  type="button"
                  className="btn ghost sm"
                  disabled={pending}
                  onClick={() =>
                    act(async () => {
                      const res = await dropReviewQuiz(lessonId);
                      if (!res.error) setQuizId(null);
                      return res;
                    })
                  }
                >
                  Build it again
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="filters">
                <span className="muted" style={{ fontSize: 13, alignSelf: "center" }}>How many</span>
                {[5, 10].map((n) => (
                  <button key={n} type="button" className={`chip${quizSize === n ? " on" : ""}`} onClick={() => setQuizSize(n)}>
                    {n}
                  </button>
                ))}
                <span className="filtersep" aria-hidden />
                {REVIEW_KINDS.map((k) => {
                  const on = quizKinds.includes(k);
                  return (
                    <button
                      key={k}
                      type="button"
                      className={`chip${on ? " on" : ""}`}
                      disabled={on && quizKinds.length === 1}
                      onClick={() => setQuizKinds((ks) => (on ? ks.filter((x) => x !== k) : [...ks, k]))}
                    >
                      {KIND_LABEL[k]}
                    </button>
                  );
                })}
              </div>
              <div className="rowacts">
                <button
                  type="button"
                  className="btn accent"
                  disabled={pending}
                  onClick={() =>
                    act(async () => {
                      const res = await buildReviewQuiz(lessonId, quizSize, quizKinds);
                      if (res.setId) setQuizId(res.setId);
                      return res;
                    })
                  }
                >
                  {pending ? "Building…" : "Build the review quiz"}
                </button>
                <span className="muted" style={{ fontSize: 13 }}>
                  {wrong > 0
                    ? "What went wrong today, then others on the same ground. Not sent."
                    : "Nothing marked wrong, so it comes off the lesson's ground. Not sent."}
                </span>
              </div>
            </>
          )}
          {note && <span className={`formmsg ${note.includes("already") || note.includes("No ") ? "bad" : "good"}`}>{note}</span>}
        </section>
      )}

      {sent && note && <p className="formmsg good">{note}</p>}
    </div>
  );
}

/**
 * One question at a time on a screen the student is looking at too, with the class picking an
 * option before the answer is shown. The lesson's questions and its review quiz both run through
 * this, so they behave identically; only where the marks are recorded differs.
 */
function Run({
  questions,
  outcomes,
  pending,
  onMark,
  barEnd,
}: {
  questions: TeachQuestion[];
  outcomes: Record<string, "right" | "wrong" | null>;
  pending: boolean;
  onMark: (id: string, outcome: "right" | "wrong" | null) => void;
  /** Anything the lesson wants beside the count, such as ending the lesson. */
  barEnd?: React.ReactNode;
}) {
  const [at, setAt] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const q = questions[Math.min(at, questions.length - 1)];
  if (!q) return null;
  const done = questions.filter((x) => outcomes[x.id]).length;

  function go(to: number) {
    setAt(Math.max(0, Math.min(questions.length - 1, to)));
    setPicked(null);
    setShown(null);
  }

  function mark(outcome: "right" | "wrong", move = true) {
    const next = outcomes[q!.id] === outcome && move ? null : outcome;
    onMark(q!.id, next);
    if (move && next && at < questions.length - 1) setTimeout(() => setAt((i) => Math.min(i + 1, questions.length - 1)), 250);
  }

  function check() {
    if (!q || !picked || !q.right) return;
    setShown(q.id);
    mark(picked === q.right ? "right" : "wrong", false);
  }

  return (
    <>
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
          {barEnd}
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
        {!q.outline && q.marks >= 10 && (
          <p className="muted" style={{ fontSize: 13, marginTop: 14 }}>No model answer outline for this one.</p>
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
    </>
  );
}
