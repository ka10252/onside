"use client";

import Link from "next/link";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PreviewPanel, QuestionLine } from "@/components/QuestionPreview";
import { reportIfStale } from "@/components/stale";
import { shortDateSG } from "@/lib/due";
import type { BankQuestion } from "@/lib/admin";
import type { Lesson, LessonItem, LessonNote, Outcome, PracticeSet, PrepareQuestion, ReviewPlan, UnitBrief } from "@/lib/lesson";
import {
  KIND_LABEL,
  Q_TYPES,
  PRACTICE_KINDS,
  REVIEW_KINDS,
  SOURCE_LABEL,
  TYPE_LABEL,
  typeOf,
  type QSource,
  type QType,
  type ReviewKind,
} from "@/lib/question-types";
import { Blocks, Rich } from "@/components/Rich";
import { Diagram } from "@/components/Diagram";
import { Notes } from "@/components/Notes";
import { MarkScheme } from "./MarkScheme";
import {
  applyTemplate,
  buildHomework,
  buildPractice,
  buildReviewQuiz,
  dropPractice,
  sendPractice,
  dropHomework,
  dropReviewQuiz,
  sendNotes,
  unsendNotes,
  pickQuestions,
  saveLessonNotes,
  sendHomework,
  sendReviewQuiz,
  setOutcome,
} from "@/lib/lesson-actions";

type Pool = (BankQuestion & { seen: boolean; spans: boolean })[];

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
  today,
  review,
  reviewQuestions,
  practice,
  practiceAnswers,
  sentNotes,
  studentId,
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
  /** Today in Singapore, so a date held for later can be told from one that is already here. */
  today: string;
  /** What the review quiz should hold, as the tutor has set it. */
  review: { size: number; kinds: ReviewKind[] };
  /** The built review quiz with its answers, to go through before running it. */
  reviewQuestions: PrepareQuestion[];
  /** Extra practice already built for this lesson, newest last. */
  practice: PracticeSet[];
  /** Those sets' questions with their answers, for checking a set before it goes. */
  practiceAnswers: PrepareQuestion[];
  /** Which of this lesson's units the student can already read, and when they were sent. */
  sentNotes: { unit: number; title: string; sentAt: string | null }[];
  studentId: string;
}) {
  const [picked, setPicked] = useState<string[]>(lesson.items.map((i) => i.question_id));
  const [outcomes, setOutcomes] = useState<Record<string, Outcome | null>>(
    Object.fromEntries(lesson.items.map((i) => [i.question_id, i.outcome])),
  );
  const [notes, setNotes] = useState(lesson.notes);
  const [note, setNote] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [band, setBand] = useState<QType | "both">("mcq");
  const [sendOn, setSendOn] = useState("");
  const [dropped, setDropped] = useState<string[]>([]);
  const [reviewOn, setReviewOn] = useState("");
  const [extraSize, setExtraSize] = useState(10);
  const [extraKinds, setExtraKinds] = useState<ReviewKind[]>(PRACTICE_KINDS);
  const [extraSource, setExtraSource] = useState<QSource>("past");
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

  const shown = band === "both" ? pool.filter((q) => q.spans) : pool.filter((q) => typeOf(q) === band);
  const spanning = pool.filter((q) => q.spans).length;
  const wrong = picked.filter((id) => outcomes[id] === "wrong");

  function toggle(id: string) {
    const next = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
    setPicked(next);
    run(() => pickQuestions(lesson.id, next));
  }

  function mark(id: string, outcome: Outcome) {
    const next = outcomes[id] === outcome ? null : outcome;
    setOutcomes((o) => ({ ...o, [id]: next }));
    run(() => setOutcome(lesson.id, id, next));
  }

  return (
    <div className="stack">
      {lessonNotes.some((n) => n.tutor) && (
        <details className="card tutoronly">
          <summary className="card-hd" style={{ cursor: "pointer" }}>
            <h2>For you only</h2>
            <span className="muted" style={{ fontSize: 14 }}>Never on the Teach screen</span>
          </summary>
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
        </details>
      )}

      {sentNotes.length > 0 && (
        <section className="card">
          <div className="card-hd">
            <h2>Revision notes for {studentFirstName}</h2>
            <span className="rowacts">
              {sentNotes.some((n) => !n.sentAt) && (
                <button
                  type="button"
                  className="btn accent sm"
                  disabled={pending}
                  onClick={() => run(() => sendNotes(studentId, sentNotes.filter((n) => !n.sentAt).map((n) => n.unit)))}
                >
                  Send {sentNotes.filter((n) => !n.sentAt).length === sentNotes.length ? "both" : "the rest"}
                </button>
              )}
            </span>
          </div>
          <ul className="pick">
            {sentNotes.map((n) => (
              <li key={n.unit}>
                <span className="n">{n.unit}</span>
                <span className="pickopen" style={{ textAlign: "left", cursor: "default" }}>
                  {n.title}
                </span>
                <span className="rowacts">
                  {n.sentAt ? (
                    <>
                      <span className="pill green">Sent {shortDateSG(n.sentAt)}</span>
                      <button type="button" className="btn ghost sm" disabled={pending} onClick={() => run(() => unsendNotes(studentId, n.unit))}>
                        Take back
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn sm" disabled={pending} onClick={() => run(() => sendNotes(studentId, [n.unit]))}>
                      Send unit {n.unit}
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {lessonNotes.some((n) => n.body) && (
        <details className="card">
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

      <details className="card">
        <summary className="card-hd" style={{ cursor: "pointer" }}>
          <h2>What the papers ask for</h2>
          <span className="muted" style={{ fontSize: 14 }}>M22–N25 · counted, not guessed</span>
        </summary>
        <div className="cardbody briefgrid">
          <Facet label="Diagrams to be able to draw" items={brief.diagrams} />
          <Facet label="How it is asked" items={brief.commands} />
          <Facet label="Terms asked to define" items={brief.defined} />
        </div>
        <p className="cardbody note" style={{ margin: 0, paddingTop: 0 }}>
          Past-paper questions held for this unit: {brief.stock.short} short · {brief.stock.explain} explain ·{" "}
          {brief.stock.essay} essay. Multiple choice comes from the unit tests — the IB sets none.
        </p>
      </details>

      <details className="card">
        <summary className="card-hd" style={{ cursor: "pointer" }}>
          <h2>Questions for the lesson</h2>
          <span className="rowacts">
            <span className="muted" style={{ fontSize: 14 }}>
              {picked.length} picked{pending ? " · saving…" : ""}
            </span>
            <button
              type="button"
              className="btn sm"
              disabled={pending}
              title={`${brief.recipe.mcq} MCQ · ${brief.recipe.definition} definition · ${brief.recipe.short} short answer · ${brief.recipe.diagram} diagram · ${brief.recipe.essay} essay set`}
              onClick={(e) => {
                e.preventDefault();
                run(async () => {
                  const res = await applyTemplate(lesson.id);
                  if (!res.error) setPicked([]);
                  return res;
                });
              }}
            >
              Fill from the template
            </button>
          </span>
        </summary>
        <p className="cardbody note" style={{ margin: 0, paddingBottom: 0 }}>
          The template for this lesson: <b>{brief.recipe.mcq} multiple choice</b> · <b>{brief.recipe.definition} definition</b> ·{" "}
          <b>{brief.recipe.short} short answer</b> · <b>{brief.recipe.diagram} diagram</b> ·{" "}
          <b>{brief.recipe.essay} essay set (a + b)</b>{`, because the papers make it ${brief.recipe.why}.`}
        </p>
        <div className="cardbody modes">
          <span className="lbl">Show</span>
          <div className="seg">
            {[...Q_TYPES, ...(spanning > 0 ? (["both"] as const) : [])].map((b) => (
              <label key={b}>
                <input type="radio" name="band" checked={band === b} onChange={() => setBand(b)} />
                {b === "both" ? `Needs both units · ${spanning}` : `${TYPE_LABEL[b]} · ${pool.filter((q) => typeOf(q) === b).length}`}
              </label>
            ))}
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="cardbody muted" style={{ margin: 0 }}>
            {band === "both"
              ? "No past question in this lesson is tagged to both of its units."
              : `No ${TYPE_LABEL[band].toLowerCase()} questions in these units.`}
          </p>
        ) : (
          <ul className="pick">
            {shown.map((q) => (
              <li key={q.id} className={open === q.id ? "expanded" : undefined}>
                <span className="n">{q.marks}</span>
                <button type="button" className="pickopen" onClick={() => setOpen(open === q.id ? null : q.id)}>
                  <QuestionLine q={q} seen={q.seen ? { state: "sent", at: "", set: "" } : undefined} />
                </button>
                <span className="rowacts">
                  {q.spans && <span className="pill ink">both units</span>}
                  <button type="button" className={`btn sm${picked.includes(q.id) ? " ghost" : ""}`} onClick={() => toggle(q.id)} disabled={pending}>
                    {picked.includes(q.id) ? "In the lesson ✓" : "Add"}
                  </button>
                </span>
                {open === q.id && <PreviewPanel id={q.id} />}
              </li>
            ))}
          </ul>
        )}
      </details>

      {chosen.length > 0 && (
        <details className="card">
          <summary className="card-hd" style={{ cursor: "pointer" }}>
            <h2>In the lesson</h2>
            <span className="muted" style={{ fontSize: 14 }}>
              {chosen.length} questions, answers beside them
              {chosen.filter((q) => q.outline).length > 0
                ? ` · ${chosen.filter((q) => q.outline).length} with a model answer outline`
                : ""}
            </span>
          </summary>
          <ol className="preplist">
            {chosen.map((q) => (
              <PrepRow key={q.id} q={q} outcome={outcomes[q.id] ?? null} pending={pending} onMark={mark} />
            ))}
          </ol>
        </details>
      )}

      {chosen.some((q) => q.outline) && (
        <details className="card" open>
          <summary className="card-hd" style={{ cursor: "pointer" }}>
            <h2>Model answer outlines</h2>
            <span className="muted" style={{ fontSize: 14 }}>
              {chosen.filter((q) => q.outline).length} of this lesson&rsquo;s {chosen.filter((q) => q.marks >= 10).length} essays
            </span>
          </summary>
          <div className="cardbody stack" style={{ gap: 22 }}>
            {chosen
              .filter((q) => q.outline)
              .map((q) => (
                <div key={q.id}>
                  <p className="meta" style={{ margin: "0 0 6px" }}>
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
          </div>
        </details>
      )}

      {left.length > 0 && (
        <details className="card">
          <summary className="card-hd" style={{ cursor: "pointer" }}>
            <h2>Homework</h2>
            <span className="muted" style={{ fontSize: 14 }}>
              {left.filter((q) => !dropped.includes(q.id)).length} of {left.length} chosen, from the ones never marked
            </span>
          </summary>
          <div className="cardbody stack" style={{ gap: 12 }}>
            {lesson.homework_assignment_id ? (
              <span className="rowacts">
                <span className="formmsg good" style={{ margin: 0 }}>
                  {lesson.homework_assignment_id.startsWith("queued:")
                    ? `Built and waiting. The daily run sends it to ${studentFirstName} on the day you chose.`
                    : `Already sent to ${studentFirstName}.`}
                </span>
                {lesson.homework_set_id && (
                  <a className="btn ghost sm" href={`/tutor/sets/${lesson.homework_set_id}/preview`} target="_blank" rel="noreferrer">
                    See it as {studentFirstName} will
                  </a>
                )}
              </span>
            ) : lesson.homework_set_id ? (
              <>
                <p className="note" style={{ margin: 0 }}>
                  Built and not sent. Look at it the way {studentFirstName} will, then choose the day.
                </p>
                <div className="rowacts" style={{ flexWrap: "wrap" }}>
                  <a className="btn" href={`/tutor/sets/${lesson.homework_set_id}/preview`} target="_blank" rel="noreferrer">
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
                    onClick={() => run(() => sendHomework(lesson.id, null, sendOn || null))}
                  >
                    {pending ? "Sending…" : sendOn && sendOn > today ? `Hold until ${sendOn}` : `Send to ${studentFirstName}`}
                  </button>
                  <button type="button" className="btn ghost" disabled={pending} onClick={() => run(() => dropHomework(lesson.id))}>
                    Choose again
                  </button>
                </div>
              </>
            ) : (
              <>
                <ol className="pick">
                  {left.map((q) => (
                    <li key={q.id}>
                      <span className="n">{q.marks}</span>
                      <span className="pickopen" style={{ textAlign: "left", cursor: "default" }}>
                        <QuestionLine q={q} />
                      </span>
                      <span className="rowacts">
                        <button
                          type="button"
                          className={`btn sm${dropped.includes(q.id) ? " ghost" : ""}`}
                          onClick={() => setDropped((d) => (d.includes(q.id) ? d.filter((y) => y !== q.id) : [...d, q.id]))}
                        >
                          {dropped.includes(q.id) ? "Left out" : "Sending ✓"}
                        </button>
                      </span>
                    </li>
                  ))}
                </ol>
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  {left.filter((q) => !dropped.includes(q.id)).length < 5
                    ? `Fewer than five, so ${5 - left.filter((q) => !dropped.includes(q.id)).length} more will be added on the same ground as what went wrong.`
                    : "Hints and the helper are on, as in daily practice. They can photograph work done on paper."}
                </p>
                <div className="rowacts">
                  <button
                    type="button"
                    className="btn accent"
                    disabled={pending || left.filter((q) => !dropped.includes(q.id)).length === 0}
                    onClick={() =>
                      run(() => buildHomework(lesson.id, left.filter((q) => !dropped.includes(q.id)).map((q) => q.id)))
                    }
                  >
                    {pending ? "Building…" : "Build it"}
                  </button>
                  <span className="muted" style={{ fontSize: 13 }}>Nothing is sent yet: you look at it first.</span>
                </div>
              </>
            )}
          </div>
        </details>
      )}

      <details className="card">
        <summary className="card-hd" style={{ cursor: "pointer" }}>
          <h2>Review quiz</h2>
          <span className="muted" style={{ fontSize: 14 }}>
            {wrong.length} missed in the lesson
          </span>
        </summary>
        <div className="cardbody stack" style={{ gap: 12 }}>
          {lesson.review_assignment_id ? (
            <span className="rowacts">
              <span className="formmsg good" style={{ margin: 0 }}>
                {lesson.review_assignment_id.startsWith("queued:")
                  ? `Waiting. The daily run sends it to ${studentFirstName} on the day you chose.`
                  : `Already sent to ${studentFirstName}.`}
              </span>
              {lesson.review_set_id && (
                <a className="btn ghost sm" href={`/tutor/sets/${lesson.review_set_id}/preview`} target="_blank" rel="noreferrer">
                  See it as {studentFirstName} will
                </a>
              )}
              {reviewQuestions.length > 0 && (
                <details className="sub" style={{ width: "100%" }}>
                  <summary>The answers ({reviewQuestions.length} questions)</summary>
                  <ol className="preplist">
                    {reviewQuestions.map((q) => (
                      <PrepRow key={q.id} q={q} outcome={null} pending={pending} />
                    ))}
                  </ol>
                </details>
              )}
            </span>
          ) : lesson.review_set_id ? (
            <>
              <p className="note" style={{ margin: 0 }}>
                Built and not sent. Look at it the way {studentFirstName} will, then send it.
              </p>
              {reviewQuestions.length > 0 && (
                <details className="sub">
                  <summary>The answers ({reviewQuestions.length} questions)</summary>
                  <ol className="preplist">
                    {reviewQuestions.map((q) => (
                      <PrepRow key={q.id} q={q} outcome={null} pending={pending} />
                    ))}
                  </ol>
                </details>
              )}
              <div className="rowacts" style={{ flexWrap: "wrap" }}>
                <a className="btn" href={`/tutor/sets/${lesson.review_set_id}/preview`} target="_blank" rel="noreferrer">
                  See it as {studentFirstName} will
                </a>
                <label className="opt" style={{ gap: 6 }}>
                  <span className="muted" style={{ fontSize: 13 }}>Send on</span>
                  <input type="date" className="in sm" value={reviewOn} min={today} onChange={(e) => setReviewOn(e.target.value)} />
                </label>
                <button
                  type="button"
                  className="btn accent"
                  disabled={pending}
                  onClick={() => run(() => sendReviewQuiz(lesson.id, null, reviewOn || null))}
                >
                  {pending ? "Sending…" : reviewOn && reviewOn > today ? `Hold until ${reviewOn}` : `Send to ${studentFirstName}`}
                </button>
                <button type="button" className="btn ghost" disabled={pending} onClick={() => run(() => dropReviewQuiz(lesson.id))}>
                  Build it again
                </button>
              </div>
            </>
          ) : !plan || plan.sameIdea.length + plan.others.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              Mark what {studentFirstName} missed above. The quiz is those questions plus others on the same ground,
              spread evenly over the kinds you choose. Never an essay.
            </p>
          ) : (
            <>
              <div className="filters">
                <span className="muted" style={{ fontSize: 13, alignSelf: "center" }}>How many</span>
                {[5, 10, 15].map((n) => (
                  <Link
                    key={n}
                    href={`${basePath}?lesson=${lesson.id}&size=${n}&kinds=${review.kinds.join(",")}`}
                    className={`chip${review.size === n ? " on" : ""}`}
                    scroll={false}
                  >
                    {n}
                  </Link>
                ))}
                <span className="filtersep" aria-hidden />
                <span className="muted" style={{ fontSize: 13 }}>Which kinds</span>
                {REVIEW_KINDS.map((t) => {
                  const on = review.kinds.includes(t);
                  const next = on ? review.kinds.filter((k) => k !== t) : [...review.kinds, t];
                  return (
                    <Link
                      key={t}
                      href={`${basePath}?lesson=${lesson.id}&size=${review.size}&kinds=${next.join(",")}`}
                      className={`chip${on ? " on" : ""}`}
                      scroll={false}
                      aria-disabled={on && review.kinds.length === 1}
                    >
                      {KIND_LABEL[t]}
                    </Link>
                  );
                })}
              </div>
              <p className="note" style={{ margin: 0 }}>
                {plan.sameIdea.length > 0 ? (
                  <>
                    <b>{plan.sameIdea.length} on what went wrong</b> + <b>{plan.others.length} on the rest of the ground</b> ={" "}
                  </>
                ) : (
                  <>Nothing marked wrong, so all of them are on the lesson&rsquo;s ground: </>
                )}
                {plan.sameIdea.length + plan.others.length} questions. Helper off.
                {plan.short ? ` ${plan.short}.` : ""}
              </p>
              <ol className="pick">
                {[
                  ...plan.sameIdea.map((q) => [q, "same idea"] as const),
                  ...plan.others.map((q) => [q, "same ground"] as const),
                ].map(
                  ([q, why]) => (
                    <li key={q.id}>
                      <span className="n">{q.marks}</span>
                      <span className="pickopen" style={{ textAlign: "left", cursor: "default" }}>
                        <QuestionLine q={q} />
                      </span>
                      <span className="rowacts">
                        <span className={`pill ${why === "same idea" ? "amber" : "gray"}`}>{why}</span>
                      </span>
                    </li>
                  ),
                )}
              </ol>
              <div className="rowacts">
                <button
                  type="button"
                  className="btn accent"
                  onClick={() => run(() => buildReviewQuiz(lesson.id, review.size, review.kinds))}
                  disabled={pending}
                >
                  {pending ? "Building…" : "Build the quiz"}
                </button>
                <span className="muted" style={{ fontSize: 13 }}>
                  Nothing is sent yet: you look at it first.
                </span>
              </div>
            </>
          )}
        </div>
      </details>

      <details className="card">
        <summary className="card-hd" style={{ cursor: "pointer" }}>
          <h2>Extra practice</h2>
          <span className="muted" style={{ fontSize: 14 }}>
            {practice.length === 0
              ? "Nothing built"
              : `${practice.length} built · ${practice.filter((p) => p.assignmentId).length} sent`}
          </span>
        </summary>
        <div className="cardbody stack" style={{ gap: 12 }}>
          {practice.map((p) => (
            <PracticeRow key={p.id} p={p} studentFirstName={studentFirstName} today={today} pending={pending} run={run} />
          ))}
          {practiceAnswers.length > 0 && (
            <details className="sub">
              <summary>The answers ({practiceAnswers.length} questions)</summary>
              <ol className="preplist">
                {practiceAnswers.map((q) => (
                  <PrepRow key={q.id} q={q} outcome={null} pending={pending} />
                ))}
              </ol>
            </details>
          )}
          <div className="filters">
            <span className="muted" style={{ fontSize: 13, alignSelf: "center" }}>Where from</span>
            {(["past", "either", "made"] as QSource[]).map((v) => (
              <button key={v} type="button" className={`chip${extraSource === v ? " on" : ""}`} onClick={() => setExtraSource(v)}>
                {SOURCE_LABEL[v]}
              </button>
            ))}
          </div>
          <div className="filters">
            <span className="muted" style={{ fontSize: 13, alignSelf: "center" }}>How many</span>
            {[5, 10, 15].map((n) => (
              <button key={n} type="button" className={`chip${extraSize === n ? " on" : ""}`} onClick={() => setExtraSize(n)}>
                {n}
              </button>
            ))}
            <span className="filtersep" aria-hidden />
            {PRACTICE_KINDS.map((k) => {
              const on = extraKinds.includes(k);
              return (
                <button
                  key={k}
                  type="button"
                  className={`chip${on ? " on" : ""}`}
                  disabled={on && extraKinds.length === 1}
                  onClick={() => setExtraKinds((ks) => (on ? ks.filter((x) => x !== k) : [...ks, k]))}
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
              onClick={() => run(() => buildPractice(lesson.id, extraSize, extraKinds, extraSource))}
            >
              {pending ? "Building…" : "Build a practice set"}
            </button>
            <span className="muted" style={{ fontSize: 13 }}>
              From this lesson&rsquo;s units, never a question {studentFirstName} has already been given. Hints and the helper on.
              {extraSource === "past" && extraKinds.includes("mcq") ? " The papers set no multiple choice, so none will be in it." : ""}
            </span>
          </div>
        </div>
      </details>

      <details className="card">
        <summary className="card-hd" style={{ cursor: "pointer" }}>
          <h2>Notes</h2>
          <span className="muted" style={{ fontSize: 14 }}>Yours only</span>
        </summary>
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
      </details>

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

/**
 * One question with its answer beside it, as the preparing screen shows them. The lesson's own
 * questions can be marked from here; the review quiz is only read, and marked on the Teach screen.
 */
function PrepRow({
  q,
  outcome,
  pending,
  onMark,
}: {
  q: PrepareQuestion;
  outcome: Outcome | null;
  pending: boolean;
  onMark?: (id: string, outcome: Outcome) => void;
}) {
  return (
    <li>
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
        <div className="mstext">{q.label ? <MarkScheme text={q.answer} /> : <Rich text={q.answer} />}</div>
        {q.diagram && <Diagram name={q.diagram} caption="The figure the mark scheme asks for" />}
        {q.outline ? (
          <details className="outline" open>
            <summary>Model answer outline</summary>
            <p className="outlegend">
              <span className="key must">must be said</span>
              <span className="key bonus">lifts it above a pass</span>
            </p>
            <Notes text={q.outline} />
          </details>
        ) : (
          q.marks >= 10 && (
            <p className="muted" style={{ fontSize: 13, marginTop: 14 }}>
              No model answer outline written for this one.
            </p>
          )
        )}
      </div>
      {onMark && (
        <span className="acts">
          <button
            type="button"
            className={`btn sm${outcome === "right" ? " primary" : " ghost"}`}
            onClick={() => onMark(q.id, "right")}
            disabled={pending}
          >
            Got it
          </button>
          <button
            type="button"
            className={`btn sm${outcome === "wrong" ? " danger" : " ghost"}`}
            onClick={() => onMark(q.id, "wrong")}
            disabled={pending}
          >
            Missed
          </button>
        </span>
      )}
    </li>
  );
}

/** One built practice set: look at it, choose the day, send it — or throw it away unsent. */
function PracticeRow({
  p,
  studentFirstName,
  today,
  pending,
  run,
}: {
  p: PracticeSet;
  studentFirstName: string;
  today: string;
  pending: boolean;
  run: (job: () => Promise<{ error?: string; ok?: string }>) => void;
}) {
  const [on, setOn] = useState("");
  const waiting = p.assignmentId?.startsWith("queued:");
  return (
    <div className="rowacts" style={{ flexWrap: "wrap", gap: 8 }}>
      <b style={{ minWidth: 150 }}>{p.title}</b>
      <span className="muted" style={{ fontSize: 13 }}>{p.questions} questions</span>
      <a className="btn ghost sm" href={`/tutor/sets/${p.setId}/preview`} target="_blank" rel="noreferrer">
        See it as {studentFirstName} will
      </a>
      {p.assignmentId ? (
        <span className={`pill ${waiting ? "amber" : "green"}`}>{waiting ? "Waiting for its day" : "Sent"}</span>
      ) : (
        <>
          <label className="opt" style={{ gap: 6 }}>
            <span className="muted" style={{ fontSize: 13 }}>Send on</span>
            <input type="date" className="in sm" value={on} min={today} onChange={(e) => setOn(e.target.value)} />
          </label>
          <button type="button" className="btn sm accent" disabled={pending} onClick={() => run(() => sendPractice(p.id, null, on || null))}>
            {on && on > today ? `Hold until ${on}` : "Send"}
          </button>
          <button type="button" className="btn ghost sm" disabled={pending} onClick={() => run(() => dropPractice(p.id))}>
            Throw away
          </button>
        </>
      )}
    </div>
  );
}
