import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckIcon, CrossIcon } from "@/components/Icons";
import { Nav, STUDENT_TABS } from "@/components/Nav";
import { Blocks, Rich } from "@/components/Rich";
import { answerText } from "@/lib/answer-text";
import { isPast, pastContext, tableBlock, type Block, type Question } from "@/lib/content";
import { all, json } from "@/lib/db";
import { FORMAT_LABEL } from "@/lib/format";
import { loadReview, type ReviewItem } from "@/lib/review";
import { pct, type MarkSplit } from "@/lib/scoring";
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
  const percent = rv.score.total ? Math.round((rv.score.marks / rv.score.total) * 100) : 0;

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
                  {marked
                    ? `${rv.score.marks}/${rv.score.total} marks · ${percent}%`
                    : "Submitted · waiting for your tutor's marks"}{" "}
                  · {answered} of {rv.items.length} answered
                </p>
              </div>
            </div>
          </div>

          {marked && (
            <section className="card hero">
              <div className="resulttop">
                <span className="bigmark">
                  <b>{rv.score.marks}</b>
                  <span className="of">/{rv.score.total}</span>
                </span>
                <span className="bigpc">{percent}%</span>
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
                Independent score <b>{pct(rv.score.independent)}</b> · Supported score <b>{pct(rv.score.supported)}</b>
                {rv.score.noAnswer > 0
                  ? ` · ${rv.score.noAnswer} left blank`
                  : ""}
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

          <div className="stack" style={{ gap: 14 }}>
            {items.length === 0 ? (
              <div className="card empty-state">
                <p className="muted">Nothing here. Try another filter.</p>
              </div>
            ) : (
              items.map((it) => (
                <ResultCard key={it.q.id} it={it} marked={marked} context={contexts.get(it.q.id) ?? []} unit={unitOf.get(it.q.id)?.number ?? null} />
              ))
            )}
          </div>

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
    <div className={`score ${kind}`}>
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

function ResultCard({ it, marked, context, unit }: { it: ReviewItem; marked: boolean; context: Block[]; unit: number | null }) {
  const { q, r } = it;
  const past = isPast(q);
  const attempts = json.parse<{ value: string; correct: boolean }[]>(r?.attempts, []);
  const autoResult = it.auto && attempts.length ? attempts.some((x) => x.correct) : null;
  const status = marked
    ? `${it.confirmed ?? 0}/${q.marks} marks`
    : autoResult !== null
      ? autoResult
        ? "Correct"
        : "Incorrect"
      : it.result === "No answer" || it.result === "Not opened"
        ? "No answer"
        : "Waiting for marks";
  const hintsUsed = r?.hint_level ?? 0;
  const asked = r?.ai_questions ?? 0;
  const noHelp = hintsUsed === 0 && asked === 0;

  return (
    <details className="card qc result" open={marked && (it.confirmed ?? 0) < q.marks}>
      <summary>
        <span className="meta">
          <span className="pill gray">Q{it.n}</span>
          {unit && <span>Unit {unit}</span>}
          {past && <span>{q.past.label}</span>}
          <span>{FORMAT_LABEL[q.format]}</span>
          <span className={`pill ${statusClass(marked, it, autoResult)}`}>{status}</span>
          {hintsUsed > 0 && <span className="pill hl">Hint {hintsUsed === 2 ? "1 + 2" : "1"} used</span>}
          {asked > 0 && (
            <span className="pill hl">
              Helper · {asked} {asked === 1 ? "question" : "questions"}
            </span>
          )}
          {marked && noHelp && <span className="pill gray">No help</span>}
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
        {past ? q.past.lead.length > 0 && <Blocks blocks={q.past.lead} /> : q.table && <Blocks blocks={tableBlock(q.table)} />}
        <p className="qtext" style={{ margin: 0 }}>
          <Rich text={q.prompt} /> <span className="muted">[{q.marks}]</span>
        </p>

        <div>
          <h3 className="ph3">Your answer</h3>
          <YourAnswer q={q} it={it} />
        </div>

        {marked && it.tutorMark?.note && it.tutorMark.note !== "Accepted AI suggestion" && (
          <div className="why">
            <b>Tutor comment</b>
            <p>{it.tutorMark.note}</p>
          </div>
        )}

        {marked && (
          <div>
            <h3 className="ph3">{past ? "Mark scheme" : "Answer"}</h3>
            <div className="answerbox mstext">
              <Rich text={answerText(q)} />
            </div>
          </div>
        )}
      </div>
    </details>
  );
}

function statusClass(marked: boolean, it: ReviewItem, auto: boolean | null) {
  if (marked) {
    const got = it.confirmed ?? 0;
    return got >= it.q.marks ? "green" : got === 0 ? "red" : "amber";
  }
  if (auto !== null) return auto ? "green" : "red";
  return "gray";
}

function YourAnswer({ q, it }: { q: Question; it: ReviewItem }) {
  const r = it.r;
  if (!r || it.result === "Not opened") return <p className="muted" style={{ margin: 0 }}>Not opened.</p>;
  const attempts = json.parse<{ value: string; correct: boolean }[]>(r.attempts, []);
  const parts: React.ReactNode[] = [];

  if (!isPast(q) && q.format === "mcq") {
    const pick = attempts[0]?.value;
    const opt = q.options.find((o) => o.id === pick);
    parts.push(
      pick ? (
        <p key="mcq" className="att" style={{ margin: 0 }}>
          {attempts[0]!.correct ? <CheckIcon /> : <CrossIcon />}
          <span>
            {pick.toUpperCase()}. {opt?.text}
          </span>
        </p>
      ) : (
        <p key="none" className="muted" style={{ margin: 0 }}>No answer.</p>
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
