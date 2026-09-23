import Link from "next/link";
import { notFound } from "next/navigation";
import { AssignForm } from "@/components/AssignForm";
import { ConfirmForm } from "@/components/ConfirmForm";
import { Crumbs } from "@/components/Crumbs";
import { Nav, TUTOR_TABS } from "@/components/Nav";
import { StatusBadge } from "@/components/review/StatusBadge";
import { StatusPill } from "@/components/StatusPill";
import { StudentForm } from "@/components/StudentForm";
import { assignmentsForStudent, getStudent, listSets, studentStats, type AssignmentRow } from "@/lib/admin";
import { deleteAssignment, setStudentArchived, unassign, updateStudent } from "@/lib/admin-actions";
import { conceptBoard } from "@/lib/concept-board";
import { initials } from "@/lib/format";
import { latestSummary } from "@/lib/review";
import { pct } from "@/lib/scoring";
import { requireUser } from "@/lib/session";
import { unitTestProgress } from "@/lib/unit-progress";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-SG", { day: "numeric", month: "short" });
const percent = (a: AssignmentRow) => (a.marks_total ? Math.round((a.marks_got / a.marks_total) * 100) : 0);

function daysAgo(iso: string | null) {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

export default async function StudentPage({ params }: PageProps<"/tutor/students/[id]">) {
  const user = await requireUser("tutor");
  const { id } = await params;
  const student = await getStudent(id);
  if (!student) notFound();
  const [assignments, progress, sets, board, stats, latest] = await Promise.all([
    assignmentsForStudent(id),
    unitTestProgress(id),
    listSets(),
    conceptBoard(id),
    studentStats(id),
    latestSummary(id),
  ]);

  const marked = assignments.filter((a) => a.status === "reviewed");
  const got = marked.reduce((n, a) => n + a.marks_got, 0);
  const outOf = marked.reduce((n, a) => n + a.marks_total, 0);
  const overall = outOf ? Math.round((got / outOf) * 100) : null;
  const toReview = assignments.filter((a) => a.status === "submitted");
  const today = new Date().toISOString().slice(0, 10);
  const open = assignments.filter((a) => a.status === "not_started" || a.status === "in_progress");
  const overdue = open.filter((a) => a.due_at && a.due_at < today);
  const trend = [...marked].sort((a, b) => (a.submitted_at ?? "").localeCompare(b.submitted_at ?? "")).slice(-8);
  const weakest = board.units.flatMap((u) => u.rows.map((r) => ({ row: r, unit: u.number }))).filter((x) => x.row.status === "needs").slice(0, 3);

  const assignedSetIds = new Set(assignments.map((a) => a.set_id));
  const sendable = sets
    .filter((s) => !s.review_of)
    .map((s) => ({
      id: s.id,
      label: s.title,
      note: assignedSetIds.has(s.id) ? "already sent" : `${s.question_count} questions · ${s.marks} marks`,
      disabled: assignedSetIds.has(s.id),
    }));

  return (
    <>
      <Nav user={user} tabs={TUTOR_TABS} active="/tutor" />
      <main className="page">
        <div className="wrap stack">
          <div>
            <Crumbs items={[{ href: "/tutor", label: "Students" }, { label: student.name }]} />
            <div className="phead" style={{ marginBottom: 0, alignItems: "center" }}>
              <div className="who-cell">
                <span className="avatar lg" aria-hidden>{initials(student.name)}</span>
                <div>
                  <h1 style={{ fontSize: 36 }}>{student.name}</h1>
                  <p style={{ margin: 0 }}>
                    {student.subtitle ?? "No class set"}
                    {student.archived_at && " · Archived"} · Last worked {daysAgo(stats.last_active)}
                  </p>
                </div>
              </div>
              <div className="rowacts">
                <Link href={`/tutor/students/${student.id}/concepts`} className="btn">Concept board</Link>
                <Link href={`/tutor/sets/new?student=${student.id}`} className="btn accent">Build a set</Link>
              </div>
            </div>
          </div>

          <section className="card hero">
            <h2 className="headline">
              <span>{overall === null ? "No marks yet" : `${overall}% overall`}</span>
              {latest && !latest.pending && (
                <>
                  <span className="sep">|</span>
                  <span>
                    Latest set: {pct(latest.independent)} without AI / {pct(latest.supported)} with
                  </span>
                </>
              )}
              {board.weak && (
                <>
                  <span className="sep">|</span>
                  <span>
                    Weak spot: <em>{board.weak.label}</em>
                  </span>
                </>
              )}
            </h2>
            <div className="scorefoot" style={{ marginTop: 18 }}>
              <span className="facts">
                {assignments.length} sets sent · {marked.length} marked · {stats.answered} questions answered · {stats.minutes} min of work ·{" "}
                {stats.ai_questions} AI questions · {stats.hints} hints
                {stats.paste_chars > 0 || stats.blur_count > 0
                  ? ` · pasted ${stats.paste_chars} characters, left the tab ${stats.blur_count}×`
                  : ""}
              </span>
            </div>
          </section>

          <div className="dash">
            <section className="card">
              <div className="card-hd">
                <h2>Next steps</h2>
              </div>
              <ul className="steps">
                <li>
                  <span>
                    {toReview.length
                      ? `${toReview.length} ${toReview.length === 1 ? "set is" : "sets are"} waiting for marks`
                      : "Nothing to mark"}
                  </span>
                  {toReview[0] && (
                    <Link href={`/tutor/students/${student.id}/a/${toReview[0].id}`} className="btn primary sm">
                      Review
                    </Link>
                  )}
                </li>
                <li>
                  <span>
                    {open.length ? `${open.length} set${open.length === 1 ? "" : "s"} not finished` : "No sets open"}
                    {overdue.length ? ` · ${overdue.length} overdue` : ""}
                  </span>
                </li>
                {weakest.length === 0 ? (
                  <li>
                    <span className="muted">
                      {marked.length ? "No concepts marked as needing work." : "Send marks for a set to see where they stand."}
                    </span>
                  </li>
                ) : (
                  weakest.map(({ row, unit }) => (
                    <li key={row.key} className="weak">
                      <span>
                        <StatusBadge status="needs" /> {row.label}
                      </span>
                      {!student.archived_at && (
                        <Link href={`/tutor/sets/new?student=${student.id}&unit=${unit}`} className="btn ghost sm">
                          Send practice
                        </Link>
                      )}
                    </li>
                  ))
                )}
              </ul>
            </section>

            <section className="card">
              <div className="card-hd">
                <h2>Understanding by unit</h2>
                <Link href={`/tutor/students/${student.id}/concepts`} className="muted" style={{ fontSize: 14 }}>
                  Concept board
                </Link>
              </div>
              {board.units.length === 0 ? (
                <p className="cardbody muted" style={{ margin: 0 }}>Nothing marked yet.</p>
              ) : (
                <ul className="unitbars">
                  {board.units.map((u) => {
                    const n = (s: "needs" | "shaky" | "solid") => u.rows.filter((r) => r.status === s).length;
                    return (
                      <li key={u.id}>
                        <span className="ub-name">
                          {u.number} · {u.title}
                        </span>
                        <span className="bar" aria-hidden>
                          {(["needs", "shaky", "solid"] as const).map((s) =>
                            n(s) ? <span key={s} className={`seg ${s}`} style={{ flexGrow: n(s) }} /> : null,
                          )}
                        </span>
                        <span className="ub-n" aria-label={`${n("needs")} need work, ${n("shaky")} shaky, ${n("solid")} solid`}>
                          {n("needs")} / {n("shaky")} / {n("solid")}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          <section className="card">
            <div className="card-hd">
              <h2>Assignments</h2>
              {trend.length > 1 && <span className="muted" style={{ fontSize: 14 }}>Marks over time</span>}
            </div>
            {trend.length > 1 && (
              <div className="trend">
                {trend.map((a) => (
                  <span key={a.id} className="tbar" title={`${a.set_title}: ${percent(a)}%`}>
                    <span className="fill" style={{ height: `${Math.max(4, percent(a))}%` }} />
                    <span className="tl">{percent(a)}%</span>
                  </span>
                ))}
              </div>
            )}
            {assignments.length === 0 ? (
              <p className="cardbody muted" style={{ margin: 0 }}>Nothing sent yet.</p>
            ) : (
              <div className="scrollx">
                <table className="t">
                  <thead>
                    <tr>
                      <th>Set</th>
                      <th>Status</th>
                      <th>Marks</th>
                      <th>Sent</th>
                      <th>Due</th>
                      <th>Submitted</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <Link
                            href={a.status === "not_started" ? `/tutor/sets/${a.set_id}` : `/tutor/students/${student.id}/a/${a.id}`}
                            style={{ color: "inherit", fontWeight: 600 }}
                          >
                            {a.set_title}
                          </Link>
                        </td>
                        <td>
                          <StatusPill status={a.status} answered={a.answered} total={a.total} due={a.due_at} />
                        </td>
                        <td>
                          {a.status === "reviewed" ? (
                            <b>
                              {Math.round(a.marks_got * 10) / 10}/{a.marks_total}
                            </b>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td className="muted">{day(a.assigned_at)}</td>
                        <td className="muted">{a.due_at ? day(a.due_at) : "—"}</td>
                        <td className="muted">{a.submitted_at ? day(a.submitted_at) : "—"}</td>
                        <td>
                          <div className="rowacts">
                            {a.status !== "not_started" && (
                              <Link
                                href={`/tutor/students/${student.id}/a/${a.id}`}
                                className={a.status === "submitted" ? "btn primary sm" : "btn sm"}
                              >
                                {a.status === "submitted" ? "Review" : a.status === "in_progress" ? "Watch" : "View"}
                              </Link>
                            )}
                            {a.status === "not_started" ? (
                              <ConfirmForm
                                action={unassign}
                                hidden={{ id: a.id }}
                                label="Unsend"
                                className="btn ghost sm"
                                title={`Unsend "${a.set_title}"?`}
                                body="The set disappears from the student's list. Nothing else is lost."
                                confirmLabel="Unsend"
                              />
                            ) : (
                              <ConfirmForm
                                action={deleteAssignment}
                                hidden={{ id: a.id }}
                                label="Delete"
                                className="btn ghost sm"
                                title={`Delete "${a.set_title}" for good?`}
                                body={`${student.name}'s answers, photos, marks and comments for this set are deleted and can't be brought back. The set itself stays in your list.`}
                                confirmLabel="Delete everything"
                                danger
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="dash">
            {!student.archived_at && (
              <section className="card">
                <div className="card-hd">
                  <h2>Send a set</h2>
                </div>
                <div className="cardbody">
                  <AssignForm studentId={student.id} studentName={student.name} sets={sendable} />
                </div>
              </section>
            )}
            <section className="card">
              <div className="card-hd">
                <h2>Details</h2>
              </div>
              <div className="cardbody stack" style={{ gap: 16 }}>
                <StudentForm action={updateStudent} student={student} submitLabel="Save" />
                <ConfirmForm
                  action={setStudentArchived}
                  hidden={{ id: student.id, archive: student.archived_at ? "0" : "1" }}
                  label={student.archived_at ? "Restore student" : "Archive student"}
                  className="btn ghost sm"
                  title={student.archived_at ? `Restore ${student.name}?` : `Archive ${student.name}?`}
                  body={
                    student.archived_at
                      ? "They can sign in again."
                      : "They are signed out and can't sign in. Their work is kept, and you can restore them later."
                  }
                  confirmLabel={student.archived_at ? "Restore" : "Archive"}
                  danger={!student.archived_at}
                />
              </div>
            </section>
          </div>

          <details className="card">
            <summary className="card-hd" style={{ cursor: "pointer" }}>
              <h2>Unit test coverage</h2>
              <span className="muted" style={{ fontSize: 14 }}>Sent / answered out of 30 per unit</span>
            </summary>
            <div className="scrollx">
              <table className="t">
                <thead>
                  <tr>
                    <th>Unit</th>
                    <th>Sent</th>
                    <th>Answered</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {progress.map((p) => (
                    <tr key={p.unit}>
                      <td>
                        {p.unit} · {p.title}
                      </td>
                      <td>
                        {p.sent}/{p.total}
                      </td>
                      <td>{p.answered}</td>
                      <td>
                        <div className="rowacts">
                          {!student.archived_at && p.sent < p.total && (
                            <Link
                              href={`/tutor/sets/new?student=${student.id}&unit=${p.unit}&source=test&count=${Math.min(10, p.total - p.sent)}`}
                              className="btn sm"
                            >
                              Send {Math.min(10, p.total - p.sent)} new
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      </main>
    </>
  );
}
