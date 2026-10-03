import Link from "next/link";
import { Nav, TUTOR_TABS } from "@/components/Nav";
import { LessonPlanBoard } from "@/components/tutor/LessonPlanBoard";
import { listStudents } from "@/lib/admin";
import { plannedLessons } from "@/lib/lesson-plan";
import { requireUser } from "@/lib/session";

// The lessons left before the exam, on a screen of their own. Nothing here is the student's: it is
// where a lesson is chosen, and the unit links open the preparing screen.
export default async function TeachNextPage({ searchParams }: PageProps<"/tutor/teach">) {
  const user = await requireUser("tutor");
  const { student: wanted } = (await searchParams) as { student?: string };
  const students = (await listStudents()).filter((s) => !s.archived_at);
  const student = students.find((s) => s.id === wanted) ?? students[0];
  const lessons = student ? await plannedLessons(student.id) : [];

  return (
    <>
      <Nav user={user} tabs={TUTOR_TABS} active="/tutor/teach" />
      <main className="page">
        <div className="wrap stack">
          <div className="phead" style={{ marginBottom: 0 }}>
            <div>
              <h1>What to teach next</h1>
              <p>
                Ten lessons, heaviest first. Each is a unit or two the papers set together, and a recap that fits inside half an hour.
              </p>
            </div>
            {student && (
              <span className="rowacts">
                <Link href={`/tutor/students/${student.id}`} className="btn">
                  {student.name}
                </Link>
                <Link href={`/tutor/students/${student.id}/lesson`} className="btn accent">
                  Prepare a lesson
                </Link>
              </span>
            )}
          </div>

          {students.length > 1 && (
            <nav className="filters" aria-label="Which student">
              {students.map((s) => (
                <Link key={s.id} href={`/tutor/teach?student=${s.id}`} className={`chip${s.id === student?.id ? " on" : ""}`}>
                  {s.name}
                </Link>
              ))}
            </nav>
          )}

          {!student ? (
            <div className="card empty-state">
              <p className="muted">Add a student first, and their lessons show here.</p>
            </div>
          ) : (
            <section className="card">
              <div className="cardbody">
                <LessonPlanBoard lessons={lessons} studentId={student.id} />
              </div>
            </section>
          )}
        </div>
      </main>
    </>
  );
}
