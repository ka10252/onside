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
import { getSchedule, nextSend, pickForSchedule, singaporeToday, unitsForNextSend, upcomingSends } from "@/lib/schedule";
import { PracticeCalendar, type CalendarCell } from "@/components/tutor/PracticeCalendar";
import { all } from "@/lib/db";
import { isOverdue } from "@/lib/due";
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

export default async function StudentPage({ params, searchParams }: PageProps<"/tutor/students/[id]">) {
  const user = await requireUser("tutor");
  const { id } = await params;
  const { sort } = (await searchParams) as { sort?: string };
  const student = await getStudent(id);
  if (!student) notFound();
  const [assignments, progress, board, stats, latest, schedule, parts] = await Promise.all([
    assignmentsForStudent(id),
    unitTestProgress(id),
    conceptBoard(id),
    studentStats(id),
    latestSummary(id),
    getSchedule(id),
    bankParts(),
  ]);
  const allUnits = parts.flatMap((p) => p.units);
  // What the next automatic set would hold, so the tutor can look before it goes out.
  const upcoming = nextSend(schedule);
  const nextQuestions = student.archived_at ? [] : await pickForSchedule(schedule, upcoming?.date);
  const nextUnits = unitsForNextSend(schedule);

  // Four weeks from this Monday: what already went out, and what the schedule will send.
  const { date: todaySg } = singaporeToday();
  const monday = new Date(new Date(`${todaySg}T00:00:00Z`).getTime() - ((new Date(`${todaySg}T00:00:00Z`).getUTCDay() + 6) % 7) * 86_400_000);
  const planned = new Map(upcomingSends(schedule, 42).map((u) => [u.date, u]));
  const sentRows = await all<{ on: string; title: string; status: string }>(
    `SELECT substr(a.assigned_at, 1, 10) AS on, s.title, a.status FROM assignments a JOIN sets s ON s.id = a.set_id
      WHERE a.student_id = ? AND s.title LIKE 'Daily practice%'`,
    id,
  );
  const sent = new Map(sentRows.map((r) => [r.on, r]));
  const unitName = (n: number | null) => (n === null ? "Every unit" : `Unit ${n} · ${allUnits.find((u) => u.number === n)?.title ?? ""}`);
  const cells: CalendarCell[] = Array.from({ length: 28 }, (_, i) => {
    const d = new Date(monday.getTime() + i * 86_400_000);
    const iso = d.toISOString().slice(0, 10);
    const p = planned.get(iso);
    return {
      date: iso,
      day: d.getUTCDate(),
      today: iso === todaySg,
      sent: sent.get(iso) ?? null,
      planned: schedule.enabled && p ? { time: schedule.send_at, unitLabel: unitName(p.unit), count: schedule.count } : null,
    };
  });
  const monthLabel = `${new Date(cells[0]!.date).toLocaleDateString("en-SG", { month: "long", year: "numeric" })}`;

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
                <Link href="/tutor/sets" className="btn">Sets</Link>
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

          <div className="dash split">
            {!student.archived_at && (
              <section className="card">
                <div className="card-hd">
                  <h2>Daily practice</h2>
                  <span className="muted" style={{ fontSize: 14 }}>
                    {schedule.enabled ? `On · ${schedule.send_at}` : "Off"}
                  </span>
                </div>
                <PracticeCalendar cells={cells} monthLabel={monthLabel} />
                <DailyPractice
                  schedule={schedule}
                  units={allUnits}
                  studentName={student.name}
                  next={{
                    date: upcoming?.date ?? null,
                    unitLabel:
                      nextUnits.length === 0
                        ? "Every unit"
                        : nextUnits.map((n) => `Unit ${n} · ${allUnits.find((u) => u.number === n)?.title ?? ""}`).join(", "),
                    questions: nextQuestions,
                  }}
                />
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
