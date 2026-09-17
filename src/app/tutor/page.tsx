import Link from "next/link";
import { Nav, TUTOR_TABS } from "@/components/Nav";
import { StatusPill } from "@/components/StatusPill";
import { listStudents } from "@/lib/admin";
import { initials } from "@/lib/format";
import { conceptBoard } from "@/lib/concept-board";
import { latestSummary } from "@/lib/review";
import { pct } from "@/lib/scoring";
import { StatusBadge } from "@/components/review/StatusBadge";
import { requireUser } from "@/lib/session";

export default async function StudentsPage() {
  const user = await requireUser("tutor");
  const all = listStudents();
  const rows = all.filter((r) => !r.archived_at);
  const archived = all.filter((r) => r.archived_at);
  const needReview = rows.reduce((n, r) => n + r.pending_review, 0);

  return (
    <>
      <Nav user={user} tabs={TUTOR_TABS} active="/tutor" />
      <main className="page">
        <div className="wrap stack">
          <div className="phead" style={{ marginBottom: 0 }}>
            <div>
              <h1>Students</h1>
              <p>
                {rows.length} {rows.length === 1 ? "student" : "students"} · {needReview}{" "}
                {needReview === 1 ? "submission needs" : "submissions need"} review
              </p>
            </div>
            <Link href="/tutor/students/new" className="btn accent">Add student</Link>
          </div>

          {rows.length === 0 ? (
            <div className="card empty-state">
              <h2 className="serif" style={{ margin: 0, fontSize: 26, fontWeight: 400 }}>No students yet</h2>
              <p className="muted">Add a student, then send them a set.</p>
            </div>
          ) : (
            <div className="card scrollx">
              <table className="t">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Latest assignment</th>
                    <th>Status</th>
                    <th>Independent / Supported</th>
                    <th>Concepts</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const sum = latestSummary(r.id);
                    const board = conceptBoard(r.id).counts;
                    const tested = board.needs + board.shaky + board.solid;
                    return (
                    <tr key={r.id} className="hov">
                      <td>
                        <div className="who-cell">
                          <span className="avatar" aria-hidden>{initials(r.name)}</span>
                          <div>
                            <b>{r.name}</b>
                            <div className="muted" style={{ fontSize: 13 }}>
                              {r.username ? `ID ${r.username}` : "No login yet"}
                              {r.subtitle ? ` · ${r.subtitle}` : ""}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>{r.set_title ?? <span className="muted">No assignment yet</span>}</td>
                      <td>{r.status ? <StatusPill status={r.status} answered={r.answered} total={r.total} /> : "—"}</td>
                      <td>
                        {!sum ? "—" : sum.pending ? (
                          <span className="muted">Pending</span>
                        ) : (
                          <>
                            <b>{pct(sum.independent)}</b> / {pct(sum.supported)}
                          </>
                        )}
                      </td>
                      <td>
                        {tested === 0 ? (
                          "—"
                        ) : (
                          <Link href={`/tutor/students/${r.id}/concepts`} style={{ color: "inherit", textDecoration: "none" }}>
                            {board.needs ? (
                              <>
                                <StatusBadge status="needs" />
                                <span style={{ marginLeft: 6, color: "var(--red)", fontWeight: 600 }}>
                                  {board.needs} {board.needs === 1 ? "concept" : "concepts"}
                                </span>
                              </>
                            ) : board.shaky ? (
                              <StatusBadge status="shaky" />
                            ) : (
                              <StatusBadge status="solid" />
                            )}
                          </Link>
                        )}
                      </td>
                      <td>
                        <div className="rowacts">
                          {r.oldest_submitted ? (
                            <Link href={`/tutor/students/${r.id}/a/${r.oldest_submitted}`} className="btn primary sm">
                              Review{r.pending_review > 1 ? ` (${r.pending_review})` : ""}
                            </Link>
                          ) : (
                            <Link href={`/tutor/students/${r.id}`} className="btn sm">
                              View
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {archived.length > 0 && (
            <details className="card">
              <summary className="card-hd" style={{ cursor: "pointer" }}>
                <h2>Archived · {archived.length}</h2>
              </summary>
              <table className="t">
                <tbody>
                  {archived.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div className="who-cell">
                          <span className="avatar" aria-hidden>{initials(r.name)}</span>
                          <span className="muted">{r.name}</span>
                        </div>
                      </td>
                      <td>
                        <div className="rowacts">
                          <Link href={`/tutor/students/${r.id}`} className="btn sm">View</Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </div>
      </main>
    </>
  );
}
