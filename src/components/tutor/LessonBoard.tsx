"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PreviewPanel, QuestionLine } from "@/components/QuestionPreview";
import { reportIfStale } from "@/components/stale";
import type { BankQuestion } from "@/lib/admin";
import type { Lesson, LessonItem, PrepareQuestion, ReviewPlan, UnitBrief } from "@/lib/lesson";
import { Blocks, Rich } from "@/components/Rich";
import { Notes } from "@/components/Notes";
import { applyTemplate, pickQuestions, saveLessonNotes, sendReviewQuiz, setOutcome } from "@/lib/lesson-actions";

type Pool = (BankQuestion & { seen: boolean })[];

/** Preparing a lesson, running it, and sending what went wrong back as a review quiz. */
export function LessonBoard({
  brief,
  lesson,
  pool,
  plan,
  chosen,
  studentFirstName,
}: {
  brief: UnitBrief;
  lesson: Lesson & { items: LessonItem[] };
  pool: Pool;
  plan: ReviewPlan | null;
  /** The picked questions with their answers, for the preparing screen. */
  chosen: PrepareQuestion[];
  studentFirstName: string;
}) {
  const [picked, setPicked] = useState<string[]>(lesson.items.map((i) => i.question_id));
  const [outcomes, setOutcomes] = useState<Record<string, "right" | "wrong" | null>>(
    Object.fromEntries(lesson.items.map((i) => [i.question_id, i.outcome])),
  );
  const [notes, setNotes] = useState(lesson.notes);
  const [note, setNote] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [band, setBand] = useState<"short" | "explain" | "essay">("short");
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
      {brief.notes && (
        <section className="card">
          <div className="card-hd">
            <h2>Revision notes</h2>
            <span className="muted" style={{ fontSize: 14 }}>Yours, from content/source · also on the Teach screen</span>
          </div>
          <div className="cardbody">
            <Notes text={brief.notes.body} />
          </div>
        </section>
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
