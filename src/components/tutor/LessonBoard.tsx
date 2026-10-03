"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PreviewPanel, QuestionLine } from "@/components/QuestionPreview";
import { reportIfStale } from "@/components/stale";
import { shortDateSG } from "@/lib/due";
import type { BankQuestion } from "@/lib/admin";
import type { Lesson, LessonItem, LessonNote, PrepareQuestion, ReviewPlan, UnitBrief } from "@/lib/lesson";
import { Blocks, Rich } from "@/components/Rich";
import { Notes } from "@/components/Notes";
import { applyTemplate, pickQuestions, saveLessonNotes, sendHomework, sendReviewQuiz, setOutcome } from "@/lib/lesson-actions";

type Pool = (BankQuestion & { seen: boolean })[];

/** Preparing a lesson, running it, and sending what went wrong back as a review quiz. */
export function LessonBoard({
  brief,
  lesson,
  pool,
  plan,
  chosen,
  left,
  basePath,
  studentFirstName,
  noteRead,
  notes: lessonNotes,
}: {
  brief: UnitBrief;
  lesson: Lesson & { items: LessonItem[] };
  pool: Pool;
  plan: ReviewPlan | null;
  /** The picked questions with their answers, for the preparing screen. */
  chosen: PrepareQuestion[];
  /** Questions the lesson never got to, for the homework. */
  left: BankQuestion[];
  /** This lesson's own address, for the handout link. */
  basePath: string;
  studentFirstName: string;
  /** When the student last opened these notes on their own screen, if they have. */
  noteRead: string | null;
  /** Every unit in this lesson, in the order they are taught. One lesson, one set of notes. */
  notes: LessonNote[];
}) {
  const [picked, setPicked] = useState<string[]>(lesson.items.map((i) => i.question_id));
  const [outcomes, setOutcomes] = useState<Record<string, "right" | "wrong" | null>>(
    Object.fromEntries(lesson.items.map((i) => [i.question_id, i.outcome])),
  );
  const [notes, setNotes] = useState(lesson.notes);
  const [note, setNote] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [band, setBand] = useState<"short" | "explain" | "essay">("short");
  const [withReview, setWithReview] = useState(true);
  const [pending, start] = useTransition();
  const router = useRouter();

  const run = (job: () => Promise<{ error?: string; ok?: string }>) =>
    start(async () => {
      try {
        const res = await job();
        setNote(res.error ?? res.ok ?? null);
        if (!res.error) router.refresh();
      } catch (e) {
        if (!reportIfStale(e)) throw e;
        setNote("This page is out of date. Refresh and try again.");
      }
    });

  const inBand = (q: BankQuestion) => (q.marks <= 3 ? "short" : q.marks <= 9 ? "explain" : "essay");
  const shown = pool.filter((q) => inBand(q) === band);
  const wrong = picked.filter((id) => outcomes[id] === "wrong");

  function toggle(id: string) {
    const next = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
    setPicked(next);
    run(() => pickQuestions(lesson.id, next));
  }

  function mark(id: string, outcome: "right" | "wrong") {
    const next = outcomes[id] === outcome ? null : outcome;
    setOutcomes((o) => ({ ...o, [id]: next }));
    run(() => setOutcome(lesson.id, id, next));
  }

  return (
    <div className="stack">
      {lessonNotes.some((n) => n.tutor) && (
        <section className="card tutoronly">
          <div className="card-hd">
            <h2>For you only</h2>
            <span className="muted" style={{ fontSize: 14 }}>Never on the Teach screen</span>
          </div>
          <div className="cardbody stack" style={{ gap: 18 }}>
            {lessonNotes
              .filter((n) => n.tutor)
              .map((n) => (
                <div key={n.unit}>
                  {lessonNotes.length > 1 && (
                    <p className="qlabel" style={{ marginTop: 0 }}>
                      Unit {n.unit} · {n.title}
                    </p>
                  )}
                  <Notes text={n.tutor} />
                </div>
              ))}
          </div>
        </section>
      )}

      {lessonNotes.some((n) => n.body) && (
        <details className="card" open>
          <summary className="card-hd" style={{ cursor: "pointer" }}>
            <h2>Revision notes</h2>
            <span className="rowacts">
              <span className="muted" style={{ fontSize: 14 }}>
                {lessonNotes.length > 1
                  ? `Both units in this lesson · what ${studentFirstName} reads`
                  : `What ${studentFirstName} reads · the Teach screen opens on this`}
              </span>
              {lesson.status === "taught" &&
                (noteRead ? (
                  <span className="pill gray">
                    {studentFirstName} read these {shortDateSG(noteRead)}
                  </span>
                ) : (
                  <span className="pill amber">{studentFirstName} has not opened these</span>
                ))}
              <a className="btn ghost sm" href={`${basePath}/print?unit=${brief.unit}`} target="_blank" rel="noreferrer">
                Print or save as PDF
              </a>
            </span>
          </summary>
          <div className="cardbody stack" style={{ gap: 24 }}>
            {lessonNotes
              .filter((n) => n.body)
              .map((n, i) => (
                <div key={n.unit}>
                  {i > 0 && <hr />}
                  <Notes text={n.body} />
                </div>
              ))}
          </div>
        </details>
      )}

      <section className="card">
        <div className="card-hd">
          <h2>What the papers ask for</h2>
          <span className="muted" style={{ fontSize: 14 }}>M22–N25 · counted, not guessed</span>
        </div>
        <div className="cardbody briefgrid">
          <Facet label="Diagrams to be able to draw" items={brief.diagrams} />
          <Facet label="How it is asked" items={brief.commands} />
          <Facet label="Terms asked to define" items={brief.defined} />
        </div>
        <p className="cardbody note" style={{ margin: 0, paddingTop: 0 }}>
          Past-paper questions held for this unit: {brief.stock.short} short · {brief.stock.explain} explain ·{" "}
          {brief.stock.essay} essay. Multiple choice comes from the unit tests — the IB sets none.
        </p>
      </section>

      <section className="card">
        <div className="card-hd">
          <h2>Questions for the lesson</h2>
          <span className="rowacts">
            <span className="muted" style={{ fontSize: 14 }}>
              {picked.length} picked{pending ? " · saving…" : ""}
            </span>
            <button
              type="button"
              className="btn sm"
              disabled={pending}
              title={`${brief.recipe.mcq} MCQ · ${brief.recipe.short} short · ${brief.recipe.explain} explain · ${brief.recipe.essay} essay`}
              onClick={() =>
                run(async () => {
                  const res = await applyTemplate(lesson.id);
                  if (!res.error) setPicked([]);
                  return res;
                })
              }
            >
              Fill from the template
            </button>
          </span>
        </div>
        <p className="cardbody note" style={{ margin: 0, paddingBottom: 0 }}>
          The template for this unit: <b>{brief.recipe.mcq} MCQ</b> · <b>{brief.recipe.short} short</b> ·{" "}
          <b>{brief.recipe.explain} explain</b> · <b>{brief.recipe.essay} essay</b> — because the papers make it{" "}
          {brief.recipe.why}.
        </p>
        <div className="cardbody modes">
          <span className="lbl">Show</span>
          <div className="seg">
            {(["short", "explain", "essay"] as const).map((b) => (
              <label key={b}>
                <input type="radio" name="band" checked={band === b} onChange={() => setBand(b)} />
                {{ short: "Short 1–3", explain: "Explain 4–9", essay: "Essay 10+" }[b]}
              </label>
            ))}
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="cardbody muted" style={{ margin: 0 }}>No past-paper questions of this length in unit {brief.unit}.</p>
        ) : (
          <ul className="pick">
            {shown.map((q) => (
              <li key={q.id} className={open === q.id ? "expanded" : undefined}>
                <span className="n">{q.marks}</span>
                <button type="button" className="pickopen" onClick={() => setOpen(open === q.id ? null : q.id)}>
                  <QuestionLine q={q} seen={q.seen ? { state: "sent", at: "", set: "" } : undefined} />
                </button>
                <span className="rowacts">
                  <button type="button" className={`btn sm${picked.includes(q.id) ? " ghost" : ""}`} onClick={() => toggle(q.id)} disabled={pending}>
                    {picked.includes(q.id) ? "In the lesson ✓" : "Add"}
                  </button>
                </span>
                {open === q.id && <PreviewPanel id={q.id} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      {chosen.length > 0 && (
        <section className="card">
          <div className="card-hd">
            <h2>In the lesson</h2>
            <span className="muted" style={{ fontSize: 14 }}>The answer sits beside each one. Mark them here or on the Teach screen.</span>
          </div>
          <ol className="preplist">
            {chosen.map((q) => (
              <li key={q.id}>
                <span className="n">{q.n}</span>
                <div className="q">
                  <span className="meta">
                    {q.label && <span className="pill ink">{q.label}</span>}
                    <span>
                      {q.marks} {q.marks === 1 ? "mark" : "marks"}
                    </span>
                  </span>
                  {q.context.length > 0 && (
                    <details className="sub">
                      <summary>Extracts and data ({q.context.length})</summary>
                      <Blocks blocks={q.context} />
                    </details>
                  )}
                  {q.lead.length > 0 && <Blocks blocks={q.lead} />}
                  <p className="qtext">
                    <Rich text={q.prompt} />
                  </p>
                  {q.options.length > 0 && (
                    <ol className="choices readback">
                      {q.options.map((o) => (
                        <li key={o.id} className={`choice${q.right === o.id.toUpperCase() ? " right" : ""}`}>
                          <span className="k">{o.id.toUpperCase()}</span>
                          <span className="grow">{o.text}</span>
                          {q.right === o.id.toUpperCase() && <span className="tag good">Right</span>}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
                <div className="a">
                  <span className="qlabel">{q.label ? "Mark scheme" : "Answer"}</span>
                  <div className="mstext">
                    <Rich text={q.answer} />
                  </div>
                </div>
                <span className="acts">
                  <button
                    type="button"
                    className={`btn sm${outcomes[q.id] === "right" ? " primary" : " ghost"}`}
                    onClick={() => mark(q.id, "right")}
                    disabled={pending}
                  >
                    Got it
                  </button>
                  <button
                    type="button"
                    className={`btn sm${outcomes[q.id] === "wrong" ? " danger" : " ghost"}`}
                    onClick={() => mark(q.id, "wrong")}
                    disabled={pending}
                  >
                    Missed
                  </button>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {left.length > 0 && (
        <section className="card">
          <div className="card-hd">
            <h2>Homework</h2>
            <span className="muted" style={{ fontSize: 14 }}>{left.length} never got marked in the lesson</span>
          </div>
          <div className="cardbody stack" style={{ gap: 12 }}>
            {lesson.homework_assignment_id ? (
              <p className="formmsg good" style={{ margin: 0 }}>Already sent to {studentFirstName}.</p>
            ) : (
              <>
                <ol className="pick">
                  {left.map((q) => (
                    <li key={q.id}>
                      <span className="n">{q.marks}</span>
                      <span className="pickopen" style={{ textAlign: "left", cursor: "default" }}>
                        <QuestionLine q={q} />
                      </span>
                    </li>
                  ))}
                </ol>
                <label className="opt">
                  <input type="checkbox" checked={withReview} onChange={(e) => setWithReview(e.target.checked)} />
                  <span>
                    Add the review quiz too
                    {plan && plan.missed.length > 0
                      ? ` (${plan.missed.length + plan.variants.length} more, ${left.length + plan.missed.length + plan.variants.length} in all)`
                      : " (nothing marked wrong yet)"}
                  </span>
                </label>
                <div className="rowacts">
                  <button
                    type="button"
                    className="btn accent"
                    disabled={pending}
                    onClick={() => run(() => sendHomework(lesson.id, withReview))}
                  >
                    {pending ? "Sending…" : `Send to ${studentFirstName}`}
                  </button>
                  <span className="muted" style={{ fontSize: 13 }}>Helper off. They can photograph work done on paper.</span>
                </div>
              </>
            )}
          </div>
        </section>
      )}

      <section className="card">
        <div className="card-hd">
          <h2>Review quiz</h2>
          <span className="muted" style={{ fontSize: 14 }}>
            {wrong.length} missed in the lesson
          </span>
        </div>
        <div className="cardbody stack" style={{ gap: 12 }}>
          {lesson.review_assignment_id ? (
            <p className="formmsg good" style={{ margin: 0 }}>Already sent to {studentFirstName}.</p>
          ) : !plan || plan.missed.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              Mark what {studentFirstName} missed above. The quiz is those questions plus others on the same ground —
              ten in all, multiple choice and short answers only.
            </p>
          ) : (
            <>
              <p className="note" style={{ margin: 0 }}>
                <b>{plan.missed.length} missed</b> + <b>{plan.variants.length} on the same ground</b> ={" "}
                {plan.missed.length + plan.variants.length} questions. Helper off.
                {plan.short ? ` ${plan.short}.` : ""}
              </p>
              <ol className="pick">
                {[...plan.missed.map((q) => [q, "missed"] as const), ...plan.variants.map((q) => [q, "same ground"] as const)].map(
                  ([q, why]) => (
                    <li key={q.id}>
                      <span className="n">{q.marks}</span>
                      <span className="pickopen" style={{ textAlign: "left", cursor: "default" }}>
                        <QuestionLine q={q} />
                      </span>
                      <span className="rowacts">
                        <span className={`pill ${why === "missed" ? "amber" : "gray"}`}>{why}</span>
                      </span>
                    </li>
                  ),
                )}
              </ol>
              <div className="rowacts">
                <button type="button" className="btn accent" onClick={() => run(() => sendReviewQuiz(lesson.id, null))} disabled={pending}>
                  {pending ? "Sending…" : `Send to ${studentFirstName}`}
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-hd">
          <h2>Notes</h2>
          <span className="muted" style={{ fontSize: 14 }}>Yours only</span>
        </div>
        <div className="cardbody stack" style={{ gap: 10 }}>
          <textarea
            className="answer"
            rows={5}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What to go over, what they said, what to chase next time."
          />
          <div className="rowacts">
            <button type="button" className="btn sm" onClick={() => run(() => saveLessonNotes(lesson.id, notes))} disabled={pending}>
              Save notes
            </button>
          </div>
        </div>
      </section>

      {note && <p className="formmsg good" role="status">{note}</p>}
    </div>
  );
}

function Facet({ label, items }: { label: string; items: { name: string; n: number }[] }) {
  return (
    <div>
      <span className="qlabel">{label}</span>
      {items.length === 0 ? (
        <p className="muted" style={{ margin: "4px 0 0", fontSize: 14 }}>None recorded.</p>
      ) : (
        <ul className="facet">
          {items.map((x) => (
            <li key={x.name}>
              <span>{x.name}</span>
              <b>×{x.n}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
