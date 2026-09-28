import Link from "next/link";
import { Nav, STUDENT_TABS } from "@/components/Nav";
import { formatDue } from "@/components/StatusPill";
import { dateInSG, duePieces, isOverdue, shortDateSG } from "@/lib/due";
import { UnitSelect } from "@/components/student/UnitSelect";
import { all } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { closeExpiredAssignments, hasAnswerSql } from "@/lib/student";
import { AssignmentCalendar, type StudentDay } from "@/components/student/AssignmentCalendar";
import { getSchedule, singaporeToday, upcomingSends } from "@/lib/schedule";

type Row = {
  id: string;
  title: string;
  status: "not_started" | "in_progress" | "submitted" | "reviewed";
  due_at: string | null;
  assigned_at: string;
  submitted_at: string | null;
  total: number;
  answered: number;
  helper: "on" | "off";
  time_limit_min: number | null;
  marks_got: number;
  marks_total: number;
};

type UnitRow = { assignment_id: string; number: number; title: string };

const shortDate = shortDateSG;

export default async function AssignmentsPage({ searchParams }: PageProps<"/student">) {
  const user = await requireUser("student");
  await closeExpiredAssignments();
  const { tab, unit } = (await searchParams) as { tab?: string; unit?: string };
  const rows = await all<Row>(
    `SELECT a.id, s.title, a.status, a.due_at, a.assigned_at, a.submitted_at, s.helper, s.time_limit_min,
            (SELECT COUNT(*) FROM set_items i WHERE i.set_id = s.id) AS total,
            (SELECT COUNT(*) FROM responses r WHERE r.assignment_id = a.id AND ${hasAnswerSql()}) AS answered,
            (SELECT COALESCE(SUM(q.marks), 0) FROM set_items i JOIN questions q ON q.id = i.question_id WHERE i.set_id = s.id) AS marks_total,
            (SELECT COALESCE(SUM(COALESCE((r.tutor_mark::jsonb ->> 'marks')::float, r.auto_marks, 0)), 0)
               FROM responses r WHERE r.assignment_id = a.id) AS marks_got
       FROM assignments a JOIN sets s ON s.id = a.set_id
      WHERE a.student_id = ?`,
    user.id,
  );
  // Units each set covers, for the filter and the labels on each card.
  const unitRows = await all<UnitRow>(
    `SELECT DISTINCT a.id AS assignment_id, u.number, u.title
       FROM assignments a
       JOIN set_items i ON i.set_id = a.set_id
       JOIN questions q ON q.id = i.question_id
       JOIN units u ON u.id = q.unit_id
      WHERE a.student_id = ?
      ORDER BY u.number`,
    user.id,
  );
  const unitsOf = new Map<string, UnitRow[]>();
  for (const u of unitRows) unitsOf.set(u.assignment_id, [...(unitsOf.get(u.assignment_id) ?? []), u]);

  // Four weeks from this Monday: what arrived, what is due, and what the tutor has scheduled.
  const schedule = await getSchedule(user.id);
  const { date: todaySg } = singaporeToday();
  const monday = new Date(new Date(`${todaySg}T00:00:00Z`).getTime() - ((new Date(`${todaySg}T00:00:00Z`).getUTCDay() + 6) % 7) * 86_400_000);
  const coming = new Map<string, ReturnType<typeof upcomingSends>>();
  // Not gated on `enabled`: days the tutor set by hand go out whichever way the switch is.
  for (const u of upcomingSends(schedule, 42)) coming.set(u.date, [...(coming.get(u.date) ?? []), u]);
  const shortTitle = (t: string) => (t.length > 22 ? `${t.slice(0, 21)}…` : t);
  const days: StudentDay[] = Array.from({ length: 28 }, (_, i) => {
    const d = new Date(monday.getTime() + i * 86_400_000);
    const iso = d.toISOString().slice(0, 10);
    return {
      date: iso,
      day: d.getUTCDate(),
      today: iso === todaySg,
      arrived: rows
        .filter((r) => dateInSG(r.assigned_at) === iso)
        .map((r) => ({ id: r.id, title: shortTitle(r.title), done: r.status === "submitted" || r.status === "reviewed" })),
      due: rows
        .filter((r) => r.due_at && duePieces(r.due_at).date === iso)
        .map((r) => ({
          id: r.id,
          title: shortTitle(r.title),
          time: duePieces(r.due_at!).time,
          late: isOverdue(r.due_at),
          done: r.status === "submitted" || r.status === "reviewed",
        })),
      coming: (coming.get(iso) ?? []).map((p) => ({ time: p.time, unit: p.unit, count: p.count })),
    };
  });
  const monthLabel = new Date(days[0]!.date).toLocaleDateString("en-SG", { month: "long", year: "numeric", timeZone: "UTC" });

  const todo = rows
    .filter((r) => r.status === "not_started" || r.status === "in_progress")
    .sort((a, b) => (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999") || a.assigned_at.localeCompare(b.assigned_at));
  const done = rows
    .filter((r) => r.status === "submitted" || r.status === "reviewed")
    .sort((a, b) => (b.submitted_at ?? "").localeCompare(a.submitted_at ?? ""));
  const showDone = tab === "done";
  const shown = showDone ? done : todo;
  const unitPick = Number(unit) || null;
  const units = [...new Map(shown.flatMap((r) => unitsOf.get(r.id) ?? []).map((u) => [u.number, u])).values()].sort((a, b) => a.number - b.number);
  const list = unitPick ? shown.filter((r) => (unitsOf.get(r.id) ?? []).some((u) => u.number === unitPick)) : shown;
  // Finished sets are grouped by the unit they cover, so a student can revise one topic at a time.
  const groups = showDone
    ? [...new Map<string, { label: string; sort: number; rows: Row[] }>(
        list.map((r) => {
          const us = unitsOf.get(r.id) ?? [];
          const key = us.length === 1 ? `u${us[0]!.number}` : us.length === 0 ? "none" : "mixed";
          const label = us.length === 1 ? `Unit ${us[0]!.number} · ${us[0]!.title}` : us.length === 0 ? "Other" : "Mixed units";
          const sort = us.length === 1 ? us[0]!.number : 100;
          return [key, { label, sort, rows: [] }];
        }),
      ).entries()]
        .map(([key, g]) => ({
          ...g,
          rows: list.filter((r) => {
            const us = unitsOf.get(r.id) ?? [];
            return (us.length === 1 ? `u${us[0]!.number}` : us.length === 0 ? "none" : "mixed") === key;
          }),
        }))
        .sort((a, b) => a.sort - b.sort)
    : [{ label: "", sort: 0, rows: list }];
  const tabLink = (to: "todo" | "done", u: number | null) =>
    `/student${to === "done" ? "?tab=done" : "?"}${u ? `${to === "done" ? "&" : ""}unit=${u}` : ""}`.replace(/\?$/, "");

  return (
    <>
      <Nav user={user} tabs={STUDENT_TABS} active="/student" />
      <main className="page">
        <div className="wrap stack">
          <div className="phead" style={{ marginBottom: 0 }}>
            <div>
              <h1>Assignments</h1>
              <p>
                {todo.length} to do · {done.length} done
              </p>
            </div>
          </div>

          <AssignmentCalendar cells={days} monthLabel={monthLabel} />

          <nav className="filters" aria-label="Which assignments to show">
            <Link href={tabLink("todo", unitPick)} className={`chip${showDone ? "" : " on"}`} aria-current={showDone ? undefined : "page"}>
              To do · {todo.length}
            </Link>
            <Link href={tabLink("done", unitPick)} className={`chip${showDone ? " on" : ""}`} aria-current={showDone ? "page" : undefined}>
              Done · {done.length}
            </Link>

            {units.length > 1 && (
              <UnitSelect
                units={units}
                value={unitPick}
                hrefs={Object.fromEntries([
                  ["", tabLink(showDone ? "done" : "todo", null)],
                  ...units.map((u) => [String(u.number), tabLink(showDone ? "done" : "todo", u.number)] as const),
                ])}
              />
            )}
          </nav>

          {list.length === 0 ? (
            <div className="card empty-state">
              <p className="muted">
                {showDone ? "Finished sets show here with your marks and your tutor's comments." : "Nothing to do right now."}
              </p>
            </div>
          ) : (
            groups.map((g) => (
              <section key={g.label || "all"} className="stack" style={{ gap: 12 }}>
                {g.label && (
                  <h2 className="grouphead">
                    <span>{g.label}</span>
                    <span className="rule" aria-hidden />
                    <span className="n">{g.rows.length}</span>
                  </h2>
                )}
                <div className="alist">
                  {g.rows.map((r) => {
                    const overdue = !showDone && isOverdue(r.due_at);
                    const marked = r.status === "reviewed";
                    return (
                      <Link
                        key={r.id}
                        href={showDone ? `/student/a/${r.id}/done` : `/student/a/${r.id}`}
                        className="card acard clickable"
                        style={{ color: "inherit", textDecoration: "none" }}
                      >
                        <div>
                          <h3>{r.title}</h3>
                          <div className="meta">
                            <span>{r.total} questions</span>
                            {!showDone && r.status === "in_progress" && (
                              <span>
                                {r.answered} of {r.total} answered
                              </span>
                            )}
                            {!showDone && r.helper === "off" && <span>Helper off{r.time_limit_min ? ` · ${r.time_limit_min} min` : ""}</span>}
                            <span>Sent {shortDate(r.assigned_at)}</span>
                            {showDone && r.submitted_at && <span>Submitted {shortDate(r.submitted_at)}</span>}
                            {!showDone &&
                              (unitsOf.get(r.id) ?? []).slice(0, 3).map((u) => (
                                <span key={u.number}>Unit {u.number}</span>
                              ))}
                          </div>
                        </div>
                        <div className="acard-right">
                          {marked && (
                            <span className="bigscore">
                              <b>
                                {Math.round(r.marks_got * 10) / 10}
                                <span className="of">/{r.marks_total}</span>
                              </b>
                              <span className="pc">marks</span>
                            </span>
                          )}
                          {!showDone && r.due_at && (
                            <span className={`duebox${overdue ? " late" : ""}`}>
                              <span className="dl">{overdue ? "Was due" : "Due"}</span>
                              <b>{formatDue(r.due_at)}</b>
                            </span>
                          )}
                          <span
                            className={`pill ${
                              showDone ? (marked ? "green" : "gray") : overdue ? "red" : r.status === "in_progress" ? "amber" : "gray"
                            }`}
                          >
                            {showDone
                              ? marked
                                ? "See your marks"
                                : "Waiting for marks"
                              : overdue
                                ? "Overdue"
                                : r.status === "in_progress"
                                  ? "Continue"
                                  : "Start"}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      </main>
    </>
  );
}
