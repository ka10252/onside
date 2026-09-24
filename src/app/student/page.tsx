import Link from "next/link";
import { Nav, STUDENT_TABS } from "@/components/Nav";
import { formatDue } from "@/components/StatusPill";
import { isOverdue, shortDateSG } from "@/lib/due";
import { UnitSelect } from "@/components/student/UnitSelect";
import { all } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { closeExpiredAssignments, hasAnswerSql } from "@/lib/student";

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
                    const pc = marked && r.marks_total ? Math.round((r.marks_got / r.marks_total) * 100) : null;
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
                              <span className="pc">{pc}%</span>
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
