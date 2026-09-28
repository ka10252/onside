import Link from "next/link";
import { notFound } from "next/navigation";
import { Choices } from "@/components/Choices";
import { MarkStamp } from "@/components/Icons";
import { Nav, STUDENT_TABS } from "@/components/Nav";
import { Blocks, Rich } from "@/components/Rich";
import { answerText } from "@/lib/answer-text";
import { isPast, pastContext, tableBlock, type Block, type Question } from "@/lib/content";
import { all, json } from "@/lib/db";
import { FORMAT_LABEL } from "@/lib/format";
import { ACCEPTED_NOTE, loadReview, type ReviewItem } from "@/lib/review";
import { type MarkSplit } from "@/lib/scoring";
import { requireUser } from "@/lib/session";
import { finalizeAssignment, getAssignment, isLocked } from "@/lib/student";

// A finished set, for review: the student's own answers, results, and (once the tutor has sent marks)
// marks, the tutor's comments and the answers.
export default async function ResultsPage({ params, searchParams }: PageProps<"/student/a/[id]/done">) {
  const user = await requireUser("student");
  const { id } = await params;
  const { show, unit } = (await searchParams) as { show?: string; unit?: string };
  let a = await getAssignment(id, user.id);
  if (!a) notFound();
  if (isLocked(a) && (a.status === "in_progress" || a.status === "not_started")) {
    await finalizeAssignment(a.id); // time ran out
    a = (await getAssignment(id, user.id))!;
  }
  if (!isLocked(a)) {
    return (
      <>
        <Nav user={user} tabs={STUDENT_TABS} active="/student" />
        <main className="page">
          <div className="narrow">
            <div className="card empty-state">
              <h1 className="serif" style={{ margin: 0, fontSize: 36, fontWeight: 400 }}>Not submitted yet</h1>
              <Link href={`/student/a/${a.id}`} className="btn primary" style={{ marginTop: 12 }}>
                Back to the assignment
              </Link>
            </div>
          </div>
        </main>
      </>
    );
  }

  const rv = (await loadReview(a.id))!;
  const unitRows = await all<{ id: string; number: number; title: string }>(
    `SELECT q.id, u.number, u.title FROM set_items i JOIN questions q ON q.id = i.question_id JOIN units u ON u.id = q.unit_id
      WHERE i.set_id = ? ORDER BY u.number`,
    a.set_id,
  );
  const unitOf = new Map(unitRows.map((u) => [u.id, u]));
  const contexts = new Map(
    await Promise.all(
      rv.items.filter((it) => isPast(it.q)).map(async (it) => {
        const q = it.q as Extract<Question, { past: unknown }>;
        return [q.id, await pastContext(q.past.paper, q.past.question)] as const;
      }),
    ),
  );
  const marked = a.status === "reviewed";
  const answered = rv.items.filter((it) => it.result !== "No answer" && it.result !== "Not opened").length;

  const unitPick = Number(unit) || null;
  const units = [...new Map(unitRows.map((u) => [u.number, u])).values()];
  const lost = (it: ReviewItem) => marked && (it.confirmed ?? 0) < it.q.marks;
  const helped = (it: ReviewItem) => (it.r?.hint_level ?? 0) > 0 || (it.r?.ai_questions ?? 0) > 0;
  const filters = [
    { key: "all", label: "All questions", keep: () => true },
    { key: "lost", label: "Lost marks", keep: lost },
    { key: "help", label: "Used help", keep: helped },
  ] as const;
  const picked = filters.find((f) => f.key === show) ?? filters[0];
  const items = rv.items.filter((it) => picked.keep(it) && (!unitPick || unitOf.get(it.q.id)?.number === unitPick));
  const link = (k: string, u: number | null) => {
    const q = [k === "all" ? "" : `show=${k}`, u ? `unit=${u}` : ""].filter(Boolean).join("&");
    return `/student/a/${a.id}/done${q ? `?${q}` : ""}`;
  };

  return (
    <>
      <Nav user={user} tabs={STUDENT_TABS} active="/student" />
      <main className="page">
        <div className="wrap stack">
          <div>
            <nav className="crumbs" aria-label="Breadcrumb">
              <Link href="/student" style={{ color: "inherit" }}>Assignments</Link>
              <span aria-hidden>/</span>
              <span className="cur">{a.title}</span>
            </nav>
            <div className="phead" style={{ marginBottom: 0 }}>
              <div>
                <h1>{a.title}</h1>
                <p>
                  {marked ? `${rv.score.marks} of ${rv.score.total} marks` : "Submitted · waiting for your tutor's marks"}{" "}
                  · {answered} of {rv.items.length} answered
                </p>
              </div>
            </div>
          </div>

          {!marked && (
            <section className="card hero">
              <div className="resulttop">
                <span className="bigmark">
                  <b>—</b>
                  <span className="of">/{rv.score.total}</span>
                </span>
                <span className="muted">marks in this set · your tutor is still marking</span>
              </div>
              <p className="ss" style={{ marginTop: 16 }}>
                {answered} of {rv.items.length} answered. Your answers are below.
              </p>
            </section>
          )}

          {marked && (
            <section className="card hero">
              <div className="resulttop">
                <span className="bigmark">
                  <b>{rv.score.marks}</b>
                  <span className="of">/{rv.score.total}</span>
                </span>
                <span className="muted">marks in this set</span>
              </div>
              <div className="scores">
                <Split
                  kind="ind"
                  label="Without help"
                  split={rv.score.split.withoutAi}
                  note="Answered with no hint and without asking the Helper"
                />
                <Split
                  kind="sup"
                  label="With the Helper"
                  split={rv.score.split.withAi}
                  note="You used a hint or asked the Helper on these"
                />
              </div>
              <p className="ss" style={{ marginTop: 16 }}>
                Independent score{" "}
                <b>
                  {rv.score.solvedAlone}/{rv.score.count}
                </b>{" "}
                · Supported score{" "}
                <b>
                  {rv.score.solved}/{rv.score.count}
                </b>{" "}
                questions right{rv.score.noAnswer > 0 ? ` · ${rv.score.noAnswer} left blank` : ""}
              </p>
            </section>
          )}

          {marked && (
            <nav className="filters" aria-label="Which questions to show">
              {filters.map((f) => {
                const n = rv.items.filter((it) => f.keep(it)).length;
                return (
                  <Link key={f.key} href={link(f.key, unitPick)} className={`chip${picked.key === f.key ? " on" : ""}`}>
                    {f.label} · {n}
                  </Link>
                );
              })}
              {units.length > 1 && (
                <>
                  <span className="filtersep" aria-hidden />
                  <Link href={link(picked.key, null)} className={`chip${unitPick ? "" : " on"}`}>
                    All units
                  </Link>
                  {units.map((u) => (
                    <Link key={u.number} href={link(picked.key, u.number)} className={`chip${unitPick === u.number ? " on" : ""}`}>
                      Unit {u.number}
                    </Link>
                  ))}
                </>
              )}
            </nav>
          )}

          {items.length === 0 ? (
            <div className="card empty-state">
              <p className="muted">Nothing here. Try another filter.</p>
            </div>
          ) : (
            <section className="card">
              <ol className="qsheet">
                {items.map((it) => (
                  <ResultRow
                    key={it.q.id}
                    it={it}
                    marked={marked}
                    context={contexts.get(it.q.id) ?? []}
                    unit={units.length > 1 ? (unitOf.get(it.q.id)?.number ?? null) : null}
                  />
                ))}
              </ol>
            </section>
          )}

          <div>
            <Link href="/student" className="btn">
              Back to assignments
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}

/** Marks got out of marks available on the questions done with, or without, help. */
function Split({ kind, label, split, note }: { kind: "ind" | "sup"; label: string; split: MarkSplit; note: string }) {
  const none = split.questions === 0;
  return (
    <div className={`score ${kind} split`}>
      <div>
        <span className="sl">{label}</span>
        <span className="sv frac">
          {none ? "—" : split.got}
          {!none && <span className="of">/{split.available}</span>}
        </span>
        <span className="ss">
          {none ? "No questions" : `${split.questions} ${split.questions === 1 ? "question" : "questions"}`} · {note}
        </span>
      </div>
    </div>
  );
}

/**
 * One question on the answer paper: the question and what the student wrote in the reading
 * column, the mark in a margin on the right, the way a marked script reads.
 */
function ResultRow({ it, marked, context, unit }: { it: ReviewItem; marked: boolean; context: Block[]; unit: number | null }) {
  const { q, r } = it;
  const past = isPast(q);
  const attempts = json.parse<{ value: string; correct: boolean }[]>(r?.attempts, []);
  const autoResult = it.auto && attempts.length ? attempts.some((x) => x.correct) : null;
  const blank = it.result === "No answer" || it.result === "Not opened";
  const hintsUsed = r?.hint_level ?? 0;
  const asked = r?.ai_questions ?? 0;
  const help = [hintsUsed > 0 ? `Hint ${hintsUsed === 2 ? "1 + 2" : "1"}` : "", asked > 0 ? `Helper ×${asked}` : ""].filter(Boolean).join(" · ");
  // Before the tutor confirms, only questions the site marks itself show a mark.
  const stamp = blank ? null : marked ? stampFor(it.confirmed ?? 0, q.marks) : autoResult === null ? null : stampFor(autoResult ? q.marks : 0, q.marks);

  return (
    <li className={marked && (it.confirmed ?? 0) < q.marks ? "lost" : undefined}>
      <span className="qn">
        {stamp && <MarkStamp kind={stamp.kind} label={stamp.label} />}
        <b>{it.n}</b>
      </span>

      <div className="qbody">
        {(unit || past) && (
          <span className="qlabel">
            {[unit ? `Unit ${unit}` : "", past ? q.past.label : FORMAT_LABEL[q.format]].filter(Boolean).join(" · ")}
          </span>
        )}
        {context.length > 0 && (
          <details className="sub">
            <summary>Extracts and data</summary>
            <Blocks blocks={context} />
          </details>
        )}
        {past ? q.past.lead.length > 0 && <Blocks blocks={q.past.lead} /> : q.table && <Blocks blocks={tableBlock(q.table)} />}
        <p className="qtext">
          <Rich text={q.prompt} /> <span className="muted">[{q.marks}]</span>
        </p>

        <div className="stack" style={{ gap: 6 }}>
          <span className="qlabel">Your answer</span>
          <YourAnswer q={q} it={it} marked={marked} />
        </div>

        {marked && it.tutorMark?.note && it.tutorMark.note !== ACCEPTED_NOTE && (
          <div className="why">
            <b>Tutor comment</b>
            <p>{it.tutorMark.note}</p>
          </div>
        )}

        {marked && (
          <details className="sub" open={(it.confirmed ?? 0) < q.marks}>
            <summary>{past ? "Mark scheme" : "Answer"}</summary>
            <div className="mstext">
              <Rich text={answerText(q)} />
            </div>
          </details>
        )}
      </div>

      <div className="qmargin">
        <span className="m">
          {marked ? (
            <>
              {it.confirmed ?? 0}
              <span className="of">/{q.marks}</span>
            </>
          ) : blank ? (
            "—"
          ) : (
            <span className="waiting">Not marked yet</span>
          )}
        </span>
        {help && <span className="h">{help}</span>}
        {marked && !help && !blank && <span className="h">No help</span>}
      </div>
    </li>
  );
}

/** Full marks get a circle, part marks a triangle, none a cross. */
function stampFor(got: number, marks: number): { kind: "circle" | "triangle" | "cross"; label: string } {
  if (got >= marks) return { kind: "circle", label: `Full marks: ${got} of ${marks}` };
  if (got > 0) return { kind: "triangle", label: `Some marks: ${got} of ${marks}` };
  return { kind: "cross", label: `No marks: 0 of ${marks}` };
}

function YourAnswer({ q, it, marked }: { q: Question; it: ReviewItem; marked: boolean }) {
  const r = it.r;
  if (!r || it.result === "Not opened") return <p className="muted" style={{ margin: 0 }}>Not opened.</p>;
  const attempts = json.parse<{ value: string; correct: boolean }[]>(r.attempts, []);
  const parts: React.ReactNode[] = [];

  if (!isPast(q) && q.format === "mcq") {
    const tried = attempts.map((a) => a.value);
    // The right answer is only named once the tutor has confirmed the marks.
    parts.push(
      tried.length === 0 ? (
        <p key="none" className="muted" style={{ margin: 0 }}>No answer.</p>
      ) : (
        <Choices key="mcq" q={q} tried={tried} showAnswer={marked} />
      ),
    );
  } else if (!isPast(q) && q.format === "analysis_chain") {
    const byId = new Map(q.steps.map((s) => [s.id, s.text]));
    attempts.forEach((a, i) =>
      parts.push(
        <div key={`c${i}`} className="answerbox">
          <b>
            Try {i + 1}: {a.correct ? "correct" : "not quite"}
          </b>
          <ol className="chain">
            {a.value.split(",").map((id) => (
              <li key={id}>{byId.get(id)}</li>
            ))}
          </ol>
        </div>,
      ),
    );
  } else {
    if (r.plan_text && r.plan_text !== "[]") parts.push(<div key="plan" className="answerbox"><b>Plan</b>{"\n"}{planText(r.plan_text)}</div>);
    if (r.working_text) parts.push(<div key="work" className="answerbox"><b>Working</b>{"\n"}{r.working_text}</div>);
    const typed = json.parse<string[]>(r.answers, []);
    if (typed.some(Boolean)) parts.push(<div key="ans" className="answerbox"><b>Final answer</b>{"\n"}{typed.join(" | ")}</div>);
    if (attempts.length && !isPast(q) && q.format === "calculation") {
      parts.push(
        <p key="tries" className="muted" style={{ margin: 0 }}>
          {attempts.map((a, i) => `Try ${i + 1}: ${a.value} (${a.correct ? "correct" : "not correct"})`).join(" · ")}
        </p>,
      );
    }
    if (r.final_text) parts.push(<div key="final" className="answerbox">{r.final_text}</div>);
    if (r.photo_path) {
      // eslint-disable-next-line @next/next/no-img-element -- private upload served by an auth-checked route
      parts.push(<img key="photo" className="upload" src={`/api/photo?r=${r.id}`} alt="Your diagram" />);
    }
  }
  if (!parts.length) return <p className="muted" style={{ margin: 0 }}>No answer.</p>;
  return <div className="stack" style={{ gap: 8 }}>{parts}</div>;
}

function planText(plan: string) {
  try {
    const v = JSON.parse(plan);
    return Array.isArray(v) ? v.filter(Boolean).join("\n") : plan;
  } catch {
    return plan;
  }
}
