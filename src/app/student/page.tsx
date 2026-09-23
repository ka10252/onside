import Link from "next/link";
import { Nav, STUDENT_TABS } from "@/components/Nav";
import { formatDue } from "@/components/StatusPill";
import { all } from "@/lib/db";
import { loadReview } from "@/lib/review";
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
};

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-SG", { day: "numeric", month: "short" });
const today = () => new Date().toISOString().slice(0, 10);

export default async function AssignmentsPage() {
  const user = await requireUser("student");
  await closeExpiredAssignments();
  const rows = await all<Row>(
      `SELECT a.id, s.title, a.status, a.due_at, a.assigned_at, a.submitted_at, s.helper, s.time_limit_min,
              (SELECT COUNT(*) FROM set_items i WHERE i.set_id = s.id) AS total,
              (SELECT COUNT(*) FROM responses r WHERE r.assignment_id = a.id AND ${hasAnswerSql()}) AS answered
         FROM assignments a JOIN sets s ON s.id = a.set_id
        WHERE a.student_id = ?`,
    user.id,
  );

  const todo = rows
    .filter((r) => r.status === "not_started" || r.status === "in_progress")
    .sort((a, b) => (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999") || a.assigned_at.localeCompare(b.assigned_at));
  const done = rows
    .filter((r) => r.status === "submitted" || r.status === "reviewed")
    .sort((a, b) => (b.submitted_at ?? "").localeCompare(a.submitted_at ?? ""));
  const reviews = new Map(
    await Promise.all(done.filter((r) => r.status === "reviewed").map(async (r) => [r.id, await loadReview(r.id)] as const)),
  );

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

          <section className="stack" style={{ gap: 12 }}>
            <h2 className="sechead">To do</h2>
            {todo.length === 0 ? (
              <div className="card empty-state">
                <p className="muted">Nothing to do right now.</p>
              </div>
            ) : (
              <div className="alist">
                {todo.map((r) => {
                  const overdue = r.due_at !== null && r.due_at < today();
                  return (
                    <Link key={r.id} href={`/student/a/${r.id}`} className="card acard clickable" style={{ color: "inherit", textDecoration: "none" }}>
                      <div>
                        <h3>{r.title}</h3>
                        <div className="meta">
                          <span>{r.total} questions</span>
                          {r.status === "in_progress" && (
                            <span>
                              {r.answered} of {r.total} answered
                            </span>
                          )}
                          {r.helper === "off" && <span>Helper off{r.time_limit_min ? ` · ${r.time_limit_min} min` : ""}</span>}
                          <span>Sent {shortDate(r.assigned_at)}</span>
                          {r.due_at && <span>Due {formatDue(r.due_at)}</span>}
                        </div>
                      </div>
                      <span className={`pill ${overdue ? "red" : r.status === "in_progress" ? "amber" : "gray"}`}>
                        {overdue ? "Overdue" : r.status === "in_progress" ? "Continue" : "Start"}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          <section className="stack" style={{ gap: 12 }}>
            <h2 className="sechead">Done</h2>
            {done.length === 0 ? (
              <div className="card empty-state">
                <p className="muted">Finished sets show here with your marks and your tutor&apos;s comments.</p>
              </div>
            ) : (
              <div className="alist">
                {done.map((r) => {
                  const rv = reviews.get(r.id) ?? null;
                  return (
                    <Link key={r.id} href={`/student/a/${r.id}/done`} className="card acard clickable" style={{ color: "inherit", textDecoration: "none" }}>
                      <div>
                        <h3>{r.title}</h3>
                        <div className="meta">
                          <span>{r.total} questions</span>
                          {r.submitted_at && <span>Submitted {shortDate(r.submitted_at)}</span>}
                          {rv && (
                            <span>
                              <b style={{ color: "var(--ink)" }}>
                                {rv.score.marks}/{rv.score.total}
                              </b>{" "}
                              marks
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={`pill ${rv ? "green" : "gray"}`}>{rv ? "Marked · Review" : "Waiting for marks"}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
