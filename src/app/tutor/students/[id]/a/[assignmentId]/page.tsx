import Link from "next/link";
import { Upload } from "@/components/Upload";
import { after } from "next/server";
import { notFound } from "next/navigation";
import { Blocks, Rich } from "@/components/Rich";
import { Choices } from "@/components/Choices";
import { Crumbs } from "@/components/Crumbs";
import { Nav, TUTOR_TABS } from "@/components/Nav";
import { AutoRefresh } from "@/components/review/AutoRefresh";
import { MarkForm } from "@/components/review/MarkForm";
import { RewriteAsk } from "@/components/review/RewriteAsk";
import { rewriteOf } from "@/lib/rewrite";
import { QuestionRow, Reveal } from "@/components/review/QuestionRows";
import { HelpPill, StatusBadge } from "@/components/review/StatusBadge";
import { hasPendingBatches, isMarking, pollMarkingBatches, queueMarking } from "@/lib/ai/marking";
import { isPast, pastContext, tableBlock, type Question } from "@/lib/content";
import { ConfirmForm } from "@/components/ConfirmForm";
import { all, json } from "@/lib/db";
import { relevantContext } from "@/lib/extract";
import { FORMAT_LABEL, initials } from "@/lib/format";
import { acceptAiMarks, markReviewed, rerunMarking } from "@/lib/review-actions";
import { ACCEPTED_NOTE, loadReview, type ReviewItem } from "@/lib/review";
import { requireUser } from "@/lib/session";
import { answerText } from "@/lib/answer-text";

export default async function ReviewPage({ params }: PageProps<"/tutor/students/[id]/a/[assignmentId]">) {
  const user = await requireUser("tutor");
  const { id, assignmentId } = await params;
  const rv = await loadReview(assignmentId);
  if (!rv || rv.a.student_id !== id) notFound();
  const { a, items, score, concepts, weak, facts } = rv;
  // Written answers submitted before marking existed, or never marked: start now.
  const unmarked = items.some((it) => it.r?.submitted_at && !it.auto && it.confirmed === null && !it.aiMark);
  if (rv.closed && unmarked) queueMarking(a.id);
  const batching = await hasPendingBatches(a.id);
  if (batching) after(() => pollMarkingBatches().catch((e) => console.error("batch poll failed", e)));
  const marking = await isMarking(a.id);
  const aiWaiting = items.filter((it) => it.confirmed === null && it.aiMark?.status === "done").length;
  const aiErrors = items.filter((it) => it.confirmed === null && it.aiMark?.status === "error").length;
  const first = a.student_name.split(" ")[0];
  const quizzes = await all<{ created_at: string; assignment_id: string; status: string }>(
    `SELECT s.created_at, q.id AS assignment_id, q.status FROM sets s JOIN assignments q ON q.set_id = s.id
      WHERE s.review_of = ? ORDER BY s.created_at`,
    a.id,
  );
  const lastQuiz = quizzes.at(-1);
  const reviewed = a.status === "reviewed";
  const statusLabel = { not_started: "Not started", in_progress: "In progress", submitted: "Submitted", reviewed: "Reviewed" }[a.status];

  return (
    <>
      <Nav user={user} tabs={TUTOR_TABS} active="/tutor" />
      <AutoRefresh active={marking || batching} every={batching ? 30_000 : 5_000} />
      <main className="page">
        <div className="wrap stack">
          <div>
            <Crumbs items={[{ href: "/tutor", label: "Students" }, { href: `/tutor/students/${id}`, label: a.student_name }, { label: a.title }]} />
            <div className="phead" style={{ marginBottom: 0, alignItems: "center" }}>
              <div className="who-cell">
                <span className="avatar lg" aria-hidden>{initials(a.student_name)}</span>
                <div>
                  <h1 style={{ fontSize: 36 }}>{a.student_name}</h1>
                  <p style={{ margin: 0 }}>{a.student_subtitle ?? ""}</p>
                </div>
              </div>
              {reviewed && (
                <div className="actions-row">
                  {lastQuiz && (
                    <Link href={`/tutor/students/${id}/a/${lastQuiz.assignment_id}`} className="muted" style={{ fontSize: 14 }}>
                      Review quiz sent {new Date(lastQuiz.created_at).toLocaleDateString("en-SG", { day: "numeric", month: "short" })}
                    </Link>
                  )}
                  <Link href={`/tutor/students/${id}/review?from=${a.id}`} className={lastQuiz ? "btn" : "btn accent"}>
                    {lastQuiz ? "Create another review quiz" : "Create review quiz"}
                  </Link>
                </div>
              )}
            </div>
          </div>

          <section className="card hero">
            <p className="eyebrow">
              {a.title} · {statusLabel}
              {a.helper === "off" ? " · Helper off" : ""}
            </p>
            <h2 className="headline">
              <span>
                {score.marks}/{score.total} marks{score.pending ? ` (${score.pending} to confirm)` : ""}
              </span>
              <span className="sep">|</span>
              <span>
                {score.withoutAi} of {score.count} without AI
              </span>
              {weak && (
                <>
                  <span className="sep">|</span>
                  <span>
                    Weak spot: <em>{weak.label}</em>
                  </span>
                </>
              )}
            </h2>
            <div className="scores">
              <div className="score ind">
                <div>
                  <span className="sl">Independent score · no AI</span>
                  <span className="sv frac">
                    {score.pending ? (
                      "Pending"
                    ) : (
                      <>
                        {score.solvedAlone}
                        <span className="of">/{score.count}</span>
                      </>
                    )}
                  </span>
                  <span className="ss">
                    Right with no help. Answered without AI: <b>{score.withoutAi} of {score.count}</b>
                    {score.unverified ? ` · Unverified: ${score.unverified}` : ""}
                  </span>
                </div>
                <div className="qboxes">
                  {score.questions.map((s, i) => (
                    <span key={s.id} className={s.category === "without_ai" ? "on" : undefined}>Q{i + 1}</span>
                  ))}
                </div>
              </div>
              <div className="score sup">
                <div>
                  <span className="sl">Supported score · with AI</span>
                  <span className="sv frac">
                    {score.pending ? (
                      "Pending"
                    ) : (
                      <>
                        {score.solved}
                        <span className="of">/{score.count}</span>
                      </>
                    )}
                  </span>
                  <span className="ss">
                    Right in all. Used AI on: <b>{score.withAi} of {score.count}</b>
                  </span>
                </div>
                <div className="qboxes">
                  {score.questions.map((s, i) => (
                    <span key={s.id} className={s.category === "with_ai" ? "on" : undefined}>Q{i + 1}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="scorefoot">
              <span className="facts">
                {facts.minutes} min · {facts.aiQuestions} AI questions · {facts.hints} hints
              </span>
              <div className="actions-row">
                <Link href={`/tutor/students/${id}/a/${assignmentId}/student-view`} className="btn sm">
                  See {first}&apos;s screen
                </Link>
                {marking && <span className="muted">AI is suggesting marks…</span>}
                {!marking && batching && <span className="muted">AI marks arrive within about an hour (half-price batch).</span>}
                {!marking && aiErrors > 0 && (
                  <form action={rerunMarking.bind(null, a.id)}>
                    <button className="btn sm" type="submit">Retry AI marking ({aiErrors})</button>
                  </form>
                )}
                {aiWaiting > 0 && (
                  <ConfirmForm
                    action={acceptAiMarks.bind(null, a.id)}
                    label={`Accept all AI marks (${aiWaiting})`}
                    className="btn sm"
                    title={`Accept ${aiWaiting} AI ${aiWaiting === 1 ? "mark" : "marks"}?`}
                    body="Each AI suggestion becomes the confirmed mark, and its drafted comment becomes the comment the student reads. You can still change any of them before sending."
                    confirmLabel="Accept all"
                  />
                )}
                {a.status === "submitted" && (
                  <ConfirmForm
                    action={markReviewed.bind(null, a.id)}
                    label={score.pending > 0 ? `${score.pending} to confirm` : `Send marks to ${first}`}
                    className="btn accent sm"
                    disabled={score.pending > 0}
                    title={`Send marks to ${first}?`}
                    body={`${first} sees ${score.marks}/${score.total} marks, your comments and the answers. You can still change a mark afterwards.`}
                    confirmLabel="Send marks"
                  />
                )}
                {reviewed && <span className="muted">Marks sent · changes show to {first} straight away</span>}
              </div>
            </div>
          </section>

          {concepts.length > 0 && (
            <section className="card">
              <div className="card-hd">
                <h2>Concepts in this set</h2>
                <Link href={`/tutor/students/${id}/concepts`} className="muted" style={{ fontSize: 14 }}>
                  Across the last 3 sets
                </Link>
              </div>
              <div className="scrollx">
                <table className="t">
                  <thead>
                    <tr>
                      <th>Concept</th>
                      <th>Status</th>
                      <th>Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {concepts.map((c) => (
                      <tr key={c.key}>
                        <td className="concept">{c.label}</td>
                        <td>
                          <StatusBadge status={c.status} />
                        </td>
                        <td>
                          {c.why} · {c.got}/{c.available} marks
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {score.pending > 0 && <p className="cardbody muted" style={{ margin: 0 }}>Questions still to confirm are not counted yet.</p>}
            </section>
          )}

          <section className="card">
            <div className="card-hd">
              <h2>Question by question</h2>
            </div>
            <div className="scrollx">
              <div className="qlist">
                <div className="qrow head" aria-hidden>
                  <span>Q</span>
                  <span>Question</span>
                  <span>Result</span>
                  <span>Marks</span>
                  <span>Solved</span>
                  <span>Hints</span>
                  <span>AI qs</span>
                  <span>Time</span>
                  <span />
                </div>
                {items.map((it, i) => (
                  <QuestionRow
                    key={it.q.id}
                    open={it.confirmed === null && Boolean(it.r)}
                    head={
                      <>
                        <span className="n">{it.n}</span>
                        <span className="qt clamp">{it.q.prompt.replace(/\*\*/g, "")}</span>
                        <span>{it.result}</span>
                        <span>{it.confirmed === null ? "—" : `${it.confirmed}/${it.q.marks}`}</span>
                        <span>
                          <HelpPill category={score.questions[i]!.category} />
                        </span>
                        <span className="pips" aria-label={`${it.r?.hint_level ?? 0} hints`}>
                          <span className={(it.r?.hint_level ?? 0) >= 1 ? "on" : undefined} />
                          <span className={(it.r?.hint_level ?? 0) >= 2 ? "on" : undefined} />
                        </span>
                        <span>{it.r?.ai_questions ?? 0}</span>
                        <span>{it.timeMin} min</span>
                      </>
                    }
                  >
                    <Detail it={it} assignmentId={a.id} first={first} />
                  </QuestionRow>
                ))}
              </div>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

/**
 * One question, laid out to be marked: the question itself on the left, what the student wrote on
 * the right, and the marking underneath. The mark scheme sits with the question, because marking
 * means holding the two side by side.
 */
function Detail({ it, assignmentId, first }: { it: ReviewItem; assignmentId: string; first: string }) {
  const { q, r, aiMark } = it;
  const attempts = json.parse<{ value: string; correct: boolean }[]>(r?.attempts, []);
  const past = isPast(q);
  const wrote = r?.plan_text || r?.working_text || r?.final_text || r?.photo_path || attempts.length > 0;
  return (
    <>
      <p className="meta" style={{ margin: 0 }}>
        {past && <span className="pill gray">{q.past.label}</span>}
        <span className="pill gray">{FORMAT_LABEL[q.format]}</span>
        <span>{q.marks} marks</span>
        <span>{it.concepts.map((c) => c.label).join(" · ")}</span>
        {it.timeMin > 0 && <span>{it.timeMin} min</span>}
      </p>
      {it.honesty && <p className="honesty" style={{ margin: 0 }}>{it.honesty}</p>}

      <div className="markgrid">
        <section>
          <h3>Question</h3>
          <QuestionBody q={q} tried={attempts.map((x) => x.value)} />
          <h3 style={{ marginTop: 6 }}>{past ? "Mark scheme" : "Answer"}</h3>
          <div className="answerbox mstext">
            <Rich text={past ? q.marking.text || "Not found in the mark scheme file." : answerText(q)} />
          </div>
        </section>

        <section>
          <h3>What {first} wrote</h3>
          {!wrote && <p className="muted" style={{ margin: 0 }}>{r ? "Nothing written." : "Not opened."}</p>}
          <div className="stack" style={{ gap: 10 }}>
            {attempts.map((x, i) => (
              <div key={i} className="att">
                <span className="muted">{i + 1}</span>
                {x.correct ? <span className="v">{attemptLabel(q, x.value)}</span> : <s className="v">{attemptLabel(q, x.value)}</s>}
                <span className={`pill ${x.correct ? "green" : "red"}`}>{x.correct ? "Correct" : "Incorrect"}</span>
              </div>
            ))}
            {r?.plan_text && <div className="answerbox"><b>Plan</b>{"\n"}{planText(r.plan_text)}</div>}
            {r?.working_text && <div className="answerbox"><b>Working</b>{"\n"}{r.working_text}</div>}
            {r?.final_text && <div className="answerbox">{r.final_text}</div>}
            {r?.photo_path && (
               
              <Upload responseId={r.id} alt="Student's diagram" />
            )}
          </div>
        </section>
      </div>

      {!it.auto && (
        <section className="stack" style={{ gap: 10 }}>
          <h3>Marking</h3>
          {aiMark?.status === "done" && (
            <div className="sub" style={{ padding: 14 }}>
              <p style={{ margin: "0 0 8px", fontWeight: 600 }}>
                AI suggests {aiMark.marks}/{q.marks}
                {aiMark.band ? ` · ${aiMark.band}` : ""}
              </p>
              {aiMark.evidence && aiMark.evidence.length > 0 && (
                <ul className="evid">
                  {aiMark.evidence.map((e, i) => (
                    <li key={i}>
                      <span aria-label={e.met ? "met" : "not met"}>{e.met ? "✓" : "✗"}</span>
                      <span>
                        {e.point}
                        {e.quote && (
                          <>
                            {" "}
                            — <q>{e.quote}</q>
                          </>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {aiMark.items && aiMark.items.length > 0 && (
                <ul className="evid" style={{ marginTop: 8 }}>
                  {aiMark.items.map((x, i) => (
                    <li key={i}>
                      <span>{x.status === "present" ? "✓" : x.status === "unreadable" ? "?" : "✗"}</span>
                      <span>
                        {x.item}
                        {x.note ? ` — ${x.note}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {aiMark.missed && aiMark.missed.length > 0 && (
                <p className="muted" style={{ margin: "8px 0 0", fontSize: 14 }}>Missed: {aiMark.missed.join("; ")}</p>
              )}
              {it.bullets.length > 0 && (
                <p className="muted" style={{ margin: "8px 0 0", fontSize: 14 }}>{it.bullets.join(" · ")}</p>
              )}
            </div>
          )}
          {aiMark?.status === "error" && <p className="formmsg bad" style={{ margin: 0 }}>AI marking failed. Mark it yourself or retry.</p>}
          {r && <RewriteAsk responseId={r.id} rewrite={rewriteOf(r)} />}
          <MarkForm
            assignmentId={assignmentId}
            responseId={r?.id ?? null}
            questionId={q.id}
            max={q.marks}
            suggested={aiMark?.status === "done" ? (aiMark.marks ?? null) : null}
            draft={aiMark?.status === "done" ? aiMark.comment : undefined}
            current={it.tutorMark?.marks ?? null}
            note={it.tutorMark?.note === ACCEPTED_NOTE ? undefined : it.tutorMark?.note}
          />
        </section>
      )}

      {it.log.length > 0 && (
        <section className="stack" style={{ gap: 8 }}>
          <h3>What {first} asked the Helper</h3>
          <ol className="convo">
            {it.log.map((l, i) =>
              l.who === "marker" ? (
                <li key={i} className="mk">
                  <span className="tm">{l.at}</span>
                  <span>{l.text}</span>
                </li>
              ) : (
                <li key={i}>
                  <span className="tm">{l.at}</span>
                  <b>{l.who === "student" ? "Student" : "AI"}</b>
                  <span className={l.who === "helper" ? "muted" : undefined}>{l.text}</span>
                </li>
              ),
            )}
          </ol>
        </section>
      )}

      {it.snapshots.length > 1 && (
        <Reveal label={`how it was written (${it.snapshots.length} snapshots)`}>
          <div className="answerbox">
            {it.snapshots.map((s, i) => (
              <div key={i} className="snap">
                <span className="tm">{s.at}</span>
                <span>{s.text || "—"}</span>
              </div>
            ))}
          </div>
        </Reveal>
      )}
    </>
  );
}

function attemptLabel(q: Question, value: string) {
  if (!isPast(q) && q.format === "mcq") {
    const o = q.options.find((x) => x.id === value);
    return `${value.toUpperCase()}${o ? ` · ${o.text}` : ""}`;
  }
  if (!isPast(q) && q.format === "analysis_chain") {
    const byId = new Map(q.steps.map((s, i) => [s.id, i + 1]));
    return value
      .split(",")
      .map((id) => byId.get(id) ?? "?")
      .join(" → ");
  }
  return value;
}

function planText(plan: string) {
  try {
    const v = JSON.parse(plan);
    return Array.isArray(v) ? v.filter(Boolean).join("\n") : plan;
  } catch {
    return plan;
  }
}

/** The question as the student had it: the extracts, the lead, the prompt and every option. */
async function QuestionBody({ q, tried }: { q: Question; tried: string[] }) {
  const past = isPast(q);
  return (
    <div className="stack" style={{ gap: 10 }}>
      {past && (
        <details className="sub" open>
          <summary>Extracts and data</summary>
          <Blocks blocks={relevantContext(await pastContext(q.past.paper, q.past.question), q.prompt)} />
        </details>
      )}
      {past ? q.past.lead.length > 0 && <Blocks blocks={q.past.lead} /> : q.table && <Blocks blocks={tableBlock(q.table)} />}
      <p className="qtext" style={{ margin: 0 }}>
        <Rich text={q.prompt} /> <span className="muted">[{q.marks}]</span>
      </p>
      {!past && q.format === "mcq" && <Choices q={q} tried={tried} showAnswer />}
      {!past && q.format === "analysis_chain" && (
        <ol className="chainlist">
          {q.steps.map((st) => (
            <li key={st.id}>
              <span className="n">{st.distractor ? "×" : "•"}</span>
              <span>{st.text}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
