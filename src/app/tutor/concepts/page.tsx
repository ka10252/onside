import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav, TUTOR_TABS } from "@/components/Nav";
import { listStudents } from "@/lib/admin";
import { initials } from "@/lib/format";
import { requireUser } from "@/lib/session";

// With one student this goes straight to their board.
export default async function ConceptsTab() {
  const user = await requireUser("tutor");
  const students = listStudents().filter((s) => !s.archived_at);
  if (students.length === 1) redirect(`/tutor/students/${students[0]!.id}/concepts`);
  return (
    <>
      <Nav user={user} tabs={TUTOR_TABS} active="/tutor/concepts" />
      <main className="page">
        <div className="wrap stack">
          <div className="phead" style={{ marginBottom: 0 }}>
            <div>
              <h1>Concept boards</h1>
              <p>Choose a student.</p>
            </div>
          </div>
          {students.length === 0 ? (
            <div className="card empty-state">
              <p className="muted">No students yet.</p>
            </div>
          ) : (
            <div className="card">
              <table className="t">
                <tbody>
                  {students.map((s) => (
                    <tr key={s.id} className="hov">
                      <td>
                        <div className="who-cell">
                          <span className="avatar" aria-hidden>{initials(s.name)}</span>
                          <b>{s.name}</b>
                        </div>
                      </td>
                      <td>
                        <div className="rowacts">
                          <Link href={`/tutor/students/${s.id}/concepts`} className="btn sm">Open board</Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
