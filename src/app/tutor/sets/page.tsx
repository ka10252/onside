import Link from "next/link";
import { Nav, TUTOR_TABS } from "@/components/Nav";
import { listSets, type SetRow } from "@/lib/admin";
import { requireUser } from "@/lib/session";

export default async function SetsPage() {
  const user = await requireUser("tutor");
  const all = await listSets();
  const own = all.filter((s) => !s.preset);
  const presets = all.filter((s) => s.preset);

  return (
    <>
      <Nav user={user} tabs={TUTOR_TABS} active="/tutor/sets" />
      <main className="page">
        <div className="wrap stack">
          <div className="phead" style={{ marginBottom: 0 }}>
            <div>
              <h1>Sets</h1>
              <p>Build a set from the question bank, or send a ready-made unit test.</p>
            </div>
            <Link href="/tutor/sets/new" className="btn accent">New set</Link>
          </div>

          {own.length === 0 ? (
            <div className="card empty-state">
              <h2 className="serif" style={{ margin: 0, fontSize: 26, fontWeight: 400 }}>No sets yet</h2>
              <p className="muted">Pick questions from the bank to make the first one.</p>
            </div>
          ) : (
            <SetTable title="Your sets" sets={own} />
          )}

          {presets.length > 0 && <SetTable title={`Unit tests · ${presets.length}`} sets={presets} note="30 questions each: 15 MCQ and 15 short answer. Helper off." />}
        </div>
      </main>
    </>
  );
}

function SetTable({ title, sets, note }: { title: string; sets: SetRow[]; note?: string }) {
  return (
    <section className="card">
      <div className="card-hd">
        <h2>{title}</h2>
        {note && <span className="muted" style={{ fontSize: 14 }}>{note}</span>}
      </div>
      <div className="scrollx">
        <table className="t">
          <thead>
            <tr>
              <th>Set</th>
              <th>Questions</th>
              <th>Helper</th>
              <th>Sent to</th>
              <th>Submitted</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sets.map((s) => (
              <tr key={s.id} className="hov">
                <td>
                  <b>{s.title}</b>
                  {!s.preset && (
                    <div className="muted" style={{ fontSize: 13 }}>
                      Made {new Date(s.created_at).toLocaleDateString("en-SG", { day: "numeric", month: "short" })}
                    </div>
                  )}
                </td>
                <td>
                  {s.question_count} · {s.marks} marks
                </td>
                <td>{s.helper === "off" ? `Off${s.time_limit_min ? ` · ${s.time_limit_min} min` : ""}` : "On"}</td>
                <td>{s.assigned}</td>
                <td>
                  {s.submitted} of {s.assigned}
                </td>
                <td>
                  <div className="rowacts">
                    <Link href={`/tutor/sets/${s.id}`} className="btn sm">Open</Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
