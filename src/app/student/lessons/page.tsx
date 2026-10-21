import Link from "next/link";
import { Nav } from "@/components/Nav";
import { shortDateSG } from "@/lib/due";
import { requireUser } from "@/lib/session";
import { studentTabs } from "@/lib/revision";
import { sentLessonReports } from "@/lib/lesson-report";

// What each lesson covered, once the tutor has sent the record. Not work to do: the assignments
// are that. This is what happened, with the answers beside the questions.
export default async function StudentLessonsPage() {
  const user = await requireUser("student");
  const [lessons, tabs] = await Promise.all([sentLessonReports(user.id), studentTabs(user.id)]);

  return (
    <>
      <Nav user={user} tabs={tabs} active="/student/lessons" />
      <main className="page">
        <div className="wrap stack">
          <div className="phead" style={{ marginBottom: 0 }}>
            <div>
              <h1>Lessons</h1>
              <p>
                {lessons.length === 0
                  ? "What each lesson covered, once it has been sent."
                  : `${lessons.length} ${lessons.length === 1 ? "lesson" : "lessons"} · the questions, and how each one went`}
              </p>
            </div>
          </div>

          {lessons.length === 0 ? (
            <div className="card empty-state">
              <p className="muted">A lesson appears here when your tutor sends the record of it.</p>
            </div>
          ) : (
            <div className="alist">
              {lessons.map((l) => (
                <Link
                  key={l.id}
                  href={`/student/lessons/${l.id}`}
                  className="card acard clickable"
                  style={{ color: "inherit", textDecoration: "none" }}
                >
                  <div className="stack" style={{ gap: 4 }}>
                    <b>{l.title}</b>
                    <span className="muted" style={{ fontSize: 14 }}>
                      {l.taught_at ? `Taught ${shortDateSG(l.taught_at)}` : "Not taught yet"} · sent {shortDateSG(l.sent_at)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
