import Link from "next/link";
import { notFound } from "next/navigation";
import { Crumbs } from "@/components/Crumbs";
import { Nav, TUTOR_TABS } from "@/components/Nav";
import { StatusBadge } from "@/components/review/StatusBadge";
import { getStudent } from "@/lib/admin";
import { BOARD_WINDOW, conceptBoard, type BoardRow } from "@/lib/concept-board";
import type { ConceptStatus } from "@/lib/scoring";
import { requireUser } from "@/lib/session";

const FILTERS: { key: "all" | ConceptStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "needs", label: "Needs work" },
  { key: "shaky", label: "Shaky" },
  { key: "solid", label: "Solid" },
];
const STATUS_WORD: Record<ConceptStatus, string> = { needs: "Needs work", shaky: "Shaky", solid: "Solid" };
const shortDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString("en-SG", { day: "numeric", month: "short" }) : "—");

export default async function ConceptBoardPage({ params, searchParams }: PageProps<"/tutor/students/[id]/concepts">) {
  const user = await requireUser("tutor");
  const { id } = await params;
  const { show } = (await searchParams) as { show?: string };
  const student = getStudent(id);
  if (!student) notFound();
  const filter = FILTERS.find((f) => f.key === show)?.key ?? "all";
  const board = conceptBoard(id);
  const keep = (r: BoardRow) => filter === "all" || r.status === filter;
  const units = board.units.map((u) => ({ ...u, shown: u.rows.filter(keep) })).filter((u) => u.shown.length > 0);
  const total = board.counts.needs + board.counts.shaky + board.counts.solid;

  return (
    <>
      <Nav user={user} tabs={TUTOR_TABS} active="/tutor/concepts" />
      <main className="page">
        <div className="wrap stack">
          <div>
            <Crumbs items={[{ href: "/tutor", label: "Students" }, { href: `/tutor/students/${id}`, label: student.name }, { label: "Concepts" }]} />
            <div className="phead" style={{ marginBottom: 0 }}>
              <div>
                <h1>Concept board · {student.name}</h1>
                <p>
                  Each concept is judged on the last {BOARD_WINDOW} sets that tested it. Only sets whose marks you sent count ({board.sets}{" "}
                  {board.sets === 1 ? "set" : "sets"} so far).
                </p>
              </div>
            </div>
          </div>

          {total === 0 ? (
            <div className="card empty-state">
              <h2 className="serif" style={{ margin: 0, fontSize: 26, fontWeight: 400 }}>No marked sets yet</h2>
              <p className="muted">The board fills in once you send marks for a set.</p>
            </div>
          ) : (
            <>
              <section className="card hero">
                <h2 className="headline">
                  <span>{board.counts.needs} need work</span>
                  <span className="sep">|</span>
                  <span>{board.counts.shaky} shaky</span>
                  <span className="sep">|</span>
                  <span>{board.counts.solid} solid</span>
                  {board.weak && (
                    <>
                      <span className="sep">|</span>
                      <span>
                        Weak spot: <em>{board.weak.label}</em>
                      </span>
                    </>
                  )}
                </h2>
                <div className="unitgrid">
                  {board.units.map((u) => {
                    const n = (s: ConceptStatus) => u.rows.filter((r) => r.status === s).length;
                    return (
                      <a key={u.id} href={`#unit-${u.number}`} className="unitcell">
                        <span className="un">Unit {u.number}</span>
                        <span className="ut">{u.title}</span>
                        <span className="bar" aria-hidden>
                          {(["needs", "shaky", "solid"] as const).map((s) =>
                            n(s) ? <span key={s} className={`seg ${s}`} style={{ flexGrow: n(s) }} /> : null,
                          )}
                        </span>
                        <span className="uc">
                          {n("needs")} need work · {n("shaky")} shaky · {n("solid")} solid
                          {u.untested ? ` · ${u.untested} of ${u.total} sections not tested` : ""}
                        </span>
                      </a>
                    );
                  })}
                </div>
              </section>

              <nav className="filters" aria-label="Filter by status">
                {FILTERS.map((f) => {
                  const count = f.key === "all" ? total : board.counts[f.key];
                  return (
                    <Link
                      key={f.key}
                      href={f.key === "all" ? `/tutor/students/${id}/concepts` : `/tutor/students/${id}/concepts?show=${f.key}`}
                      className={`chip${filter === f.key ? " on" : ""}`}
                      aria-current={filter === f.key ? "page" : undefined}
                    >
                      {f.label} · {count}
                    </Link>
                  );
                })}
              </nav>

              {units.length === 0 && (
                <div className="card empty-state">
                  <p className="muted">No concepts with this status.</p>
                </div>
              )}

              {units.map((u) => (
                <section key={u.id} id={`unit-${u.number}`} className="card">
                  <div className="card-hd">
                    <h2>
                      Unit {u.number} · {u.title}
                    </h2>
                    {u.untested > 0 && <span className="muted" style={{ fontSize: 14 }}>{u.untested} of {u.total} sections not tested yet</span>}
                  </div>
                  <div className="scrollx">
                    <table className="t board">
                      <colgroup>
                        <col />
                        <col style={{ width: 150 }} />
                        <col style={{ width: 120 }} />
                        <col style={{ width: 80 }} />
                        <col style={{ width: 220 }} />
                        <col style={{ width: 110 }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>Concept</th>
                          <th>Status</th>
                          <th>Last {BOARD_WINDOW} sets</th>
                          <th>Marks</th>
                          <th>Why</th>
                          <th>Last tested</th>
                        </tr>
                      </thead>
                      <tbody>
                        {u.shown.map((r) => (
                          <tr key={r.key}>
                            <td className="concept">{r.label}</td>
                            <td>
                              <StatusBadge status={r.status} />
                            </td>
                            <td>
                              <span className="trail">
                                {r.sets.map((s) => (
                                  <Link
                                    key={s.assignmentId}
                                    href={`/tutor/students/${id}/a/${s.assignmentId}`}
                                    className={`tdot ${s.status}`}
                                    title={`${s.title} · ${shortDate(s.date)} · ${STATUS_WORD[s.status]} · ${s.got}/${s.available}`}
                                    aria-label={`${s.title}: ${STATUS_WORD[s.status]}, ${s.got} of ${s.available} marks`}
                                  />
                                ))}
                              </span>
                            </td>
                            <td>
                              {r.got}/{r.available}
                            </td>
                            <td>{r.why}</td>
                            <td>{shortDate(r.lastSeen)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </>
          )}
        </div>
      </main>
    </>
  );
}
