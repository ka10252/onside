import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmForm } from "@/components/ConfirmForm";
import { Crumbs } from "@/components/Crumbs";
import { Nav, TUTOR_TABS } from "@/components/Nav";
import { StatusBadge } from "@/components/review/StatusBadge";
import { formatDue, StatusPill } from "@/components/StatusPill";
import { StudentForm } from "@/components/StudentForm";
import { assignmentsForStudent, getStudent, studentStats, type AssignmentRow } from "@/lib/admin";
import { deleteAssignment, setStudentArchived, unassign, updateStudent } from "@/lib/admin-actions";
import { conceptBoard } from "@/lib/concept-board";
import { DailyPractice } from "@/components/tutor/DailyPractice";
import { bankParts } from "@/lib/admin";
import { getSchedule, nextSend } from "@/lib/schedule";
import { timesOf } from "@/lib/schedule-shared";
import { PracticeCalendar } from "@/components/tutor/PracticeCalendar";
import { practiceMonth } from "@/lib/practice-calendar";
import { all } from "@/lib/db";
import { isOverdue, shortDateSG } from "@/lib/due";
import { initials } from "@/lib/format";
import { latestSummary } from "@/lib/review";
import { requireUser } from "@/lib/session";
import { unitTestProgress } from "@/lib/unit-progress";
import { unitReview } from "@/lib/unit-weight";
import { UnitReviewBoard } from "@/components/tutor/UnitReviewBoard";

const day = shortDateSG;
const percent = (a: AssignmentRow) => (a.marks_total ? Math.round((a.marks_got / a.marks_total) * 100) : 0);

function daysAgo(iso: string | null) {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

export default async function StudentPage({ params, searchParams }: PageProps<"/tutor/students/[id]">) {
  const user = await requireUser("tutor");
  const { id } = await params;
  const { sort, month: monthParam } = (await searchParams) as { sort?: string; month?: string };
  const student = await getStudent(id);
  if (!student) notFound();
  const [assignments, progress, board, stats, latest, schedule, parts, units] = await Promise.all([
    assignmentsForStudent(id),
    unitTestProgress(id),
    conceptBoard(id),
    studentStats(id),
    latestSummary(id),
    getSchedule(id),
    bankParts(),
    unitReview(id),
  ]);
  const allUnits = parts.flatMap((p) => p.units);
  const unitName = (n: number | null) => (n === null ? "Every unit" : `Unit ${n} · ${allUnits.find((u) => u.number === n)?.title ?? ""}`);
  // What the next automatic set would hold, so the tutor can look before it goes out.
  const upcoming = nextSend(schedule);

  // The calendar's month, which the tutor can step through.
  const calendar = await practiceMonth(id, monthParam);

  const marked = assignments.filter((a) => a.status === "reviewed");
  const got = marked.reduce((n, a) => n + a.marks_got, 0);
  const outOf = marked.reduce((n, a) => n + a.marks_total, 0);
  const overall = outOf ? Math.round((got / outOf) * 100) : null;
  const toReview = assignments.filter((a) => a.status === "submitted");
  const open = assignments.filter((a) => a.status === "not_started" || a.status === "in_progress");
  const overdue = open.filter((a) => isOverdue(a.due_at));
  // Which units each set covers, for the "by unit" order and the Units column.
  const unitRows = await all<{ assignment_id: string; number: number }>(
    `SELECT DISTINCT a.id AS assignment_id, u.number
       FROM assignments a JOIN set_items i ON i.set_id = a.set_id
       JOIN questions q ON q.id = i.question_id JOIN units u ON u.id = q.unit_id
      WHERE a.student_id = ? ORDER BY u.number`,
    id,
  );
  const unitsOf = new Map<string, number[]>();
  for (const r of unitRows) unitsOf.set(r.assignment_id, [...(unitsOf.get(r.assignment_id) ?? []), r.number]);
  const byUnit = sort === "unit";
  const ordered = [...assignments].sort((a, b) =>
    byUnit
      ? (unitsOf.get(a.id)?.[0] ?? 99) - (unitsOf.get(b.id)?.[0] ?? 99) || b.assigned_at.localeCompare(a.assigned_at)
      : b.assigned_at.localeCompare(a.assigned_at),
  );

  const newestMarked = [...marked].sort((a, b) => (b.submitted_at ?? "").localeCompare(a.submitted_at ?? ""))[0];
  const weakUnit = board.units.find((u) => u.rows.some((r) => r.status === "needs"))?.number;

  const trend = [...marked].sort((a, b) => (a.submitted_at ?? "").localeCompare(b.submitted_at ?? "")).slice(-8);
  const weakest = board.units.flatMap((u) => u.rows.map((r) => ({ row: r, unit: u.number }))).filter((x) => x.row.status === "needs").slice(0, 3);

  return (
    <>
      <Nav user={user} tabs={TUTOR_TABS} active="/tutor" />
      <main className="page">
        <div className="wrap stack">
          <div>
            <Crumbs items={[{ href: "/tutor", label: "Students" }, { label: student.name }]} />
            <div className="phead" style={{ marginBottom: 0, alignItems: "center" }}>
              <details className="whodetails">
                <summary>
                  <span className="who-cell">
                    <span className="avatar lg" aria-hidden>{initials(student.name)}</span>
                    <span>
                      <span className="nameline">
                        <h1 style={{ fontSize: 36 }}>{student.name}</h1>
                        <span className="caret" aria-hidden>▾</span>
                      </span>
                      <span className="sub">
                        {student.subtitle ?? "No class set"}
                        {student.archived_at && " · Archived"} · Last worked {daysAgo(stats.last_active)}
                      </span>
                    </span>
                  </span>
                </summary>
                <div className="card cardbody detailsopen" style={{ marginTop: 14 }}>
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
              </details>
              <div className="rowacts">
                <Link href={`/tutor/students/${student.id}/concepts`} className="btn">Concept board</Link>
                <Link href="/tutor/sets" className="btn">Sets</Link>
                <Link href={`/tutor/sets/new?student=${student.id}`} className="btn accent">Build a set</Link>
              </div>
            </div>
          </div>

          <section className="card hero">
            <h2 className="headline">
              <span>{overall === null ? "No marks yet" : `${got} of ${outOf} marks`}</span>
              {latest && !latest.pending && (
                <>
                  <span className="sep">|</span>
                  <span>
                    Latest set: {latest.solvedAlone} of {latest.count} right without help, {latest.solved} of {latest.count} in all
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
              {!student.archived_at && (
                <div className="cardbody rowacts" style={{ paddingTop: 0 }}>
                  {newestMarked ? (
                    <Link href={`/tutor/students/${student.id}/review?from=${newestMarked.id}`} className="btn sm">
                      Review set from what they got wrong
                    </Link>
                  ) : (
                    <span className="muted" style={{ fontSize: 14 }}>A review set needs a marked set first.</span>
                  )}
                  <Link
                    href={`/tutor/sets/new?student=${student.id}&mode=ai${weakUnit ? `&unit=${weakUnit}` : ""}&count=5`}
                    className="btn sm"
                  >
                    New AI questions{weakUnit ? ` on unit ${weakUnit}` : ""}
                  </Link>
                </div>
              )}
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
              <nav className="filters" aria-label="Order">
                <Link href={`/tutor/students/${student.id}`} className={`chip${byUnit ? "" : " on"}`}>
                  Newest first
                </Link>
                <Link href={`/tutor/students/${student.id}?sort=unit`} className={`chip${byUnit ? " on" : ""}`}>
                  By unit
                </Link>
              </nav>
            </div>
            {trend.length > 1 && (
              <div className="trend">
                {trend.map((a) => (
                  <span key={a.id} className="tbar" title={`${a.set_title}: ${a.marks_got} of ${a.marks_total} marks`}>
                    <span className="fill" style={{ height: `${Math.max(4, percent(a))}%` }} />
                    <span className="tl">
                      {Math.round(a.marks_got * 10) / 10}/{a.marks_total}
                    </span>
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
                      <th>Units</th>
                      <th>Status</th>
                      <th>Marks</th>
                      <th>Sent</th>
                      <th>Due</th>
                      <th>Submitted</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {ordered.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <Link
                            href={a.status === "not_started" ? `/tutor/sets/${a.set_id}` : `/tutor/students/${student.id}/a/${a.id}`}
                            style={{ color: "inherit", fontWeight: 600 }}
                          >
                            {a.set_title}
                          </Link>
                        </td>
                        <td className="muted">{(unitsOf.get(a.id) ?? []).join(", ") || "—"}</td>
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
                        <td className="muted">{a.due_at ? formatDue(a.due_at) : "—"}</td>
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
                                title="Delete this assignment?"
                                body={`Everything ${student.name} did on "${a.set_title}" is removed and can't be brought back.`}
                                details={[
                                  `${a.answered} of ${a.total} questions answered`,
                                  a.status === "reviewed" ? `Marks: ${Math.round(a.marks_got * 10) / 10}/${a.marks_total}, and your comments` : "Any marks and comments",
                                  "Diagram photos, hints used and activity",
                                  "The set itself stays in your list, so you can send it again",
                                ]}
                                confirmLabel="Delete"
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

          <div className="dash full">
            {!student.archived_at && (
              <section className="card">
                <div className="card-hd">
                  <h2>Daily practice</h2>
                  <span className="muted" style={{ fontSize: 14 }}>
                    {schedule.enabled ? `On · ${timesOf(schedule).join(", ")}` : "Off"}
                  </span>
                </div>
                <PracticeCalendar
                  cells={calendar.cells}
                  month={calendar.month}
                  thisMonth={calendar.thisMonth}
                  units={allUnits}
                  studentId={student.id}
                  sendTime={schedule.send_at}
                  count={schedule.count}
                />
                <DailyPractice
                  schedule={schedule}
                  units={allUnits}
                  studentName={student.name}
                  next={
                    upcoming
                      ? { date: upcoming.date, time: upcoming.time, unitLabel: unitName(upcoming.unit), count: upcoming.count }
                      : null
                  }
                />
              </section>
            )}

          </div>

          <section className="card">
            <div className="card-hd">
              <h2>What to teach next</h2>
              <span className="muted" style={{ fontSize: 14 }}>
                How much of the exam each unit carries (M22–N25), against how this student is doing in it
              </span>
            </div>
            <div className="cardbody">
              <UnitReviewBoard rows={units} studentId={id} />
            </div>
          </section>

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
