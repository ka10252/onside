import Link from "next/link";
import { Nav } from "@/components/Nav";
import { shortDateSG } from "@/lib/due";
import { requireUser } from "@/lib/session";
import { studentNotes, studentTabs, unread } from "@/lib/revision";

// The notes from the lessons already taught, to read again on the student's own. A unit appears
// here the moment its lesson has been run, and not before.
export default async function StudentNotesPage() {
  const user = await requireUser("student");
  const [notes, tabs] = await Promise.all([studentNotes(user.id), studentTabs(user.id)]);

  return (
    <>
      <Nav user={user} tabs={tabs} active="/student/notes" />
      <main className="page">
        <div className="wrap stack">
          <div className="phead" style={{ marginBottom: 0 }}>
            <div>
              <h1>Revision notes</h1>
              <p>
                {notes.length === 0
                  ? "The notes from each lesson, to read again."
                  : `${notes.length} ${notes.length === 1 ? "unit" : "units"} · what each lesson covered, and how the papers ask it`}
              </p>
            </div>
          </div>

          {notes.length === 0 ? (
            <div className="card empty-state">
              <p className="muted">A unit&apos;s notes open here once the lesson on it has been taught.</p>
            </div>
          ) : (
            <div className="alist">
              {notes.map((n) => (
                <Link
                  key={n.unit}
                  href={`/student/notes/${n.unit}`}
                  className="card acard clickable"
                  style={{ color: "inherit", textDecoration: "none" }}
                >
                  <div>
                    <h3>
                      Unit {n.unit} · {n.title}
                    </h3>
                    {n.headline && <p className="muted" style={{ margin: "4px 0 0" }}>{n.headline}</p>}
                    <div className="meta">
                      <span>Taught {shortDateSG(n.taught_at)}</span>
                      {unread(n) ? (
                        <span className="pill amber">{n.read_at ? "Changed since you read it" : "Not read yet"}</span>
                      ) : (
                        <span>Read {shortDateSG(n.read_at!)}</span>
                      )}
                    </div>
                  </div>
                  <span className="btn ghost sm">Read</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
