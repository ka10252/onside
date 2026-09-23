import Link from "next/link";
import { notFound } from "next/navigation";
import { AssignForm } from "@/components/AssignForm";
import { Crumbs } from "@/components/Crumbs";
import { Nav, TUTOR_TABS } from "@/components/Nav";
import { StatusPill } from "@/components/StatusPill";
import { StudentForm } from "@/components/StudentForm";
import { assignmentsForStudent, getStudent, listSets } from "@/lib/admin";
import { setStudentArchived, unassign, updateStudent } from "@/lib/admin-actions";
import { ConfirmForm } from "@/components/ConfirmForm";
import { initials } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { unitTestProgress } from "@/lib/unit-progress";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-SG", { day: "numeric", month: "short" });

export default async function StudentPage({ params }: PageProps<"/tutor/students/[id]">) {
  const user = await requireUser("tutor");
  const { id } = await params;
  const student = await getStudent(id);
  if (!student) notFound();
  const assignments = await assignmentsForStudent(id);
  const progress = await unitTestProgress(id);
  const marked = assignments.filter((a) => a.status === "reviewed");
  const got = marked.reduce((n, a) => n + a.marks_got, 0);
  const outOf = marked.reduce((n, a) => n + a.marks_total, 0);
  const waiting = assignments.filter((a) => a.status === "submitted").length;
  const summary = (
    <span className="muted" style={{ fontSize: 14 }}>
      {assignments.length} sent · {marked.length} marked
      {outOf > 0 ? ` · ${Math.round((got / outOf) * 100)}% overall` : ""}
      {waiting ? ` · ${waiting} to review` : ""}
    </span>
  );
  const assignedSetIds = new Set(assignments.map((a) => a.set_id));
  const sets = (await listSets())
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
                    {student.archived_at && " · Archived"}
                  </p>
                </div>
              </div>
              <div className="rowacts">
                {summary}
                <Link href={`/tutor/students/${student.id}/concepts`} className="btn">
                  Concept board
                </Link>
              </div>
            </div>
          </div>

          <div className="two-col">
            <section className="card">
              <div className="card-hd">
                <h2>Assignments</h2>
              </div>
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
                              {a.status === "not_started" && (
                                <ConfirmForm
                                  action={unassign}
                                  hidden={{ id: a.id }}
                                  label="Unsend"
                                  className="btn ghost sm"
                                  title={`Unsend "${a.set_title}"?`}
                                  body="The set disappears from the student's list."
                                  confirmLabel="Unsend"
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

            <section className="card" style={{ gridColumn: 1 }}>
              <div className="card-hd">
                <h2>Unit tests</h2>
                <span className="muted" style={{ fontSize: 14 }}>Sent / answered out of 30 per unit</span>
              </div>
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
            </section>

            <div className="stack" style={{ gridColumn: 2, gridRow: "1 / span 2" }}>
              {!student.archived_at && (
                <section className="card">
                  <div className="card-hd">
                    <h2>Send a set</h2>
                  </div>
                  <div className="cardbody">
                    <AssignForm studentId={student.id} studentName={student.name} sets={sets} />
                  </div>
                </section>
              )}

              <section className="card">
                <div className="card-hd">
                  <h2>Details</h2>
                </div>
                <div className="cardbody">
                  <StudentForm action={updateStudent} student={student} submitLabel="Save" />
                </div>
              </section>

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
          </div>
        </div>
      </main>
    </>
  );
}
