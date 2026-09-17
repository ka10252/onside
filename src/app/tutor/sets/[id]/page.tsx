import Link from "next/link";
import { notFound } from "next/navigation";
import { AssignForm } from "@/components/AssignForm";
import { Crumbs } from "@/components/Crumbs";
import { Nav, TUTOR_TABS } from "@/components/Nav";
import { StatusPill } from "@/components/StatusPill";
import { assignmentsForSet, getSet, listStudents, setIsLocked } from "@/lib/admin";
import { deleteSet, unassign } from "@/lib/admin-actions";
import { ConfirmForm } from "@/components/ConfirmForm";
import { FORMAT_LABEL } from "@/lib/format";
import { requireUser } from "@/lib/session";

export default async function SetPage({ params }: PageProps<"/tutor/sets/[id]">) {
  const user = await requireUser("tutor");
  const { id } = await params;
  const set = getSet(id);
  if (!set) notFound();
  const locked = setIsLocked(id);
  const assignments = assignmentsForSet(id);
  const sentTo = new Set(assignments.map((a) => a.student_id));
  const students = listStudents()
    .filter((s) => !s.archived_at)
    .map((s) => ({
      id: s.id,
      label: s.name,
      note: sentTo.has(s.id) ? "already sent" : s.subtitle ?? undefined,
      disabled: sentTo.has(s.id),
    }));

  return (
    <>
      <Nav user={user} tabs={TUTOR_TABS} active="/tutor/sets" />
      <main className="page">
        <div className="wrap stack">
          <div>
            <Crumbs items={[{ href: "/tutor/sets", label: "Sets" }, { label: set.title }]} />
            <div className="phead" style={{ marginBottom: 0 }}>
              <div>
                <h1>{set.title}</h1>
                <p>
                  {set.question_count} questions · {set.marks} marks · AI Helper {set.helper}
                  {set.helper === "off" && set.time_limit_min ? ` · ${set.time_limit_min} min` : ""}
                </p>
              </div>
              <div className="rowacts">
                {set.preset && set.items[0] && (
                  <Link href={`/tutor/sets/new?unit=${set.items[0].unit_number}&source=test`} className="btn">
                    Send part of this test
                  </Link>
                )}
                {set.preset ? (
                  <span className="muted" style={{ fontSize: 14 }}>Ready-made unit test · send it whole or in part</span>
                ) : locked ? (
                  <span className="muted" style={{ fontSize: 14 }}>Started by a student · editing locked</span>
                ) : (
                  <>
                    <Link href={`/tutor/sets/${id}/edit`} className="btn">Edit</Link>
                    <ConfirmForm
                      action={deleteSet}
                      hidden={{ id }}
                      label="Delete"
                      className="btn ghost"
                      title="Delete this set?"
                      body={
                        assignments.length
                          ? `It is also removed from ${assignments.length} ${assignments.length === 1 ? "student" : "students"} who haven't started it.`
                          : "This can't be undone."
                      }
                      confirmLabel="Delete set"
                      danger
                    />
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="two-col">
            <div className="stack">
              <section className="card">
                <div className="card-hd">
                  <h2>Questions</h2>
                </div>
                <ol className="pick">
                  {set.items.map((q, i) => (
                    <li key={q.id}>
                      <span className="n">{i + 1}</span>
                      <span className="pickbody">
                        <span className="meta">
                          {q.past_label && <span className="pill ink">{q.past_label}</span>}
                          <span className="pill gray">{FORMAT_LABEL[q.format]}</span>
                          <span>Unit {q.unit_number} · {q.section_id}</span>
                          <span>{q.marks} {q.marks === 1 ? "mark" : "marks"}</span>
                        </span>
                        <span className="clamp">{q.prompt.replace(/\*\*/g, "")}</span>
                      </span>
                      <span className="rowacts">
                        <Link href={`/tutor/bank/${q.unit_number}#${q.id}`} className="btn ghost sm">
                          {q.past_label ? "Mark scheme" : "Answer"}
                        </Link>
                      </span>
                    </li>
                  ))}
                </ol>
              </section>

              <section className="card">
                <div className="card-hd">
                  <h2>Sent to</h2>
                </div>
                {assignments.length === 0 ? (
                  <p className="cardbody muted" style={{ margin: 0 }}>Not sent yet.</p>
                ) : (
                  <table className="t">
                    <tbody>
                      {assignments.map((a) => (
                        <tr key={a.id}>
                          <td>
                            <Link
                              href={a.status === "submitted" || a.status === "reviewed" ? `/tutor/students/${a.student_id}/a/${a.id}` : `/tutor/students/${a.student_id}`}
                              style={{ color: "inherit", fontWeight: 600 }}
                            >
                              {a.student_name}
                            </Link>
                          </td>
                          <td>
                            <StatusPill status={a.status} answered={a.answered} total={a.total} due={a.due_at} />
                          </td>
                          <td>
                            <div className="rowacts">
                              {a.status === "not_started" && (
                                <ConfirmForm
                                  action={unassign}
                                  hidden={{ id: a.id }}
                                  label="Unsend"
                                  className="btn ghost sm"
                                  title={`Unsend from ${a.student_name}?`}
                                  body="The set disappears from their list."
                                  confirmLabel="Unsend"
                                />
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            </div>

            <section className="card">
              <div className="card-hd">
                <h2>Send this set</h2>
              </div>
              <div className="cardbody">
                <AssignForm setId={id} students={students} />
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
