import Link from "next/link";
import { notFound } from "next/navigation";
import { Crumbs } from "@/components/Crumbs";
import { Nav, TUTOR_TABS } from "@/components/Nav";
import { LessonBoard } from "@/components/tutor/LessonBoard";
import { WeightPill } from "@/components/tutor/UnitWeight";
import { getStudent } from "@/lib/admin";
import { getLesson, lessonPool, lessonsFor, openLesson, prepareView, reviewPlan, teachView, unfinished, unitBrief } from "@/lib/lesson";
import { TeachBoard } from "@/components/tutor/TeachBoard";
import { noteRead } from "@/lib/revision";
import { requireUser } from "@/lib/session";

// The tutor's own room: preparing a lesson, running it, and sending a review quiz afterwards.
// Nothing here reaches the student until the review quiz is sent, and none of it touches daily practice.
export default async function LessonPage({ params, searchParams }: PageProps<"/tutor/students/[id]/lesson">) {
  const user = await requireUser("tutor");
  const { id } = await params;
  const { unit: unitParam, lesson: lessonParam, mode } = (await searchParams) as { unit?: string; lesson?: string; mode?: string };
  const teaching = mode === "teach";
  const student = await getStudent(id);
  if (!student) notFound();

  const past = await lessonsFor(id);
  const named = lessonParam ? await getLesson(lessonParam) : null;
  const unit = named?.unit ?? (Number(unitParam) || null);
  const brief = unit ? await unitBrief(unit) : null;
  // Opening a unit starts (or re-opens) its lesson, so the tutor's picks survive a refresh.
  const lesson = named ?? (unit && brief ? await getLesson((await openLesson(id, unit, `Unit ${unit} · ${brief.title}`)).id) : null);
  // In the lesson, only what the student should read is fetched at all.
  const [pool, plan, teach, chosen, left, read] = await Promise.all([
    unit && !teaching ? lessonPool(unit, id) : Promise.resolve([]),
    lesson && !teaching ? reviewPlan(lesson.id) : Promise.resolve(null),
    lesson && teaching ? teachView(lesson.id) : Promise.resolve([]),
    lesson && !teaching ? prepareView(lesson.id) : Promise.resolve([]),
    lesson && !teaching ? unfinished(lesson.id) : Promise.resolve([]),
    unit && !teaching ? noteRead(id, unit) : Promise.resolve(null),
  ]);
  const first = student.name.split(" ")[0];

  return (
    <>
      <Nav user={user} tabs={TUTOR_TABS} active="/tutor" />
      <main className="page">
        <div className="wrap stack">
          <div>
            <Crumbs
              items={[
                { href: "/tutor", label: "Students" },
                { href: `/tutor/students/${id}`, label: student.name },
                { label: "Lesson" },
              ]}
            />
            <div className="phead" style={{ marginBottom: 0 }}>
              <div>
                <h1>{brief ? `Unit ${brief.unit} · ${brief.title}` : "Prepare a lesson"}</h1>
                <p>
                  {teaching
                    ? `Only what ${first} should read. Nothing on this page gives an answer away.`
                    : `Yours only, answers and all. ${first} sees nothing here until you send the review quiz, and daily practice carries on untouched.`}
                </p>
              </div>
              <span className="rowacts">
                {brief?.weight && !teaching && <WeightPill w={brief.weight} />}
                {lesson && (
                  <nav className="filters" aria-label="Which screen">
                    <Link href={`/tutor/students/${id}/lesson?lesson=${lesson.id}`} className={`chip${teaching ? "" : " on"}`}>
                      Prepare
                    </Link>
                    <Link href={`/tutor/students/${id}/lesson?lesson=${lesson.id}&mode=teach`} className={`chip${teaching ? " on" : ""}`}>
                      Teach
                    </Link>
                  </nav>
                )}
              </span>
            </div>
          </div>

          {!brief ? (
            <section className="card cardbody">
              <p className="muted" style={{ marginTop: 0 }}>
                Pick a unit from <Link href={`/tutor/students/${id}`}>what to teach next</Link>, or one of these.
              </p>
              <div className="rowacts" style={{ flexWrap: "wrap" }}>
                {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                  <Link key={n} href={`/tutor/students/${id}/lesson?unit=${n}`} className="btn ghost sm">
                    Unit {n}
                  </Link>
                ))}
              </div>
            </section>
          ) : teaching ? (
            <TeachBoard lessonId={lesson!.id} questions={teach} notes={brief.notes?.body ?? null} />
          ) : (
            <LessonBoard
              brief={brief}
              lesson={lesson!}
              pool={pool}
              plan={plan}
              chosen={chosen}
              left={left}
              basePath={`/tutor/students/${id}/lesson`}
              studentFirstName={first}
              noteRead={read}
            />
          )}

          {past.length > 0 && !teaching && (
            <details className="card">
              <summary className="card-hd" style={{ cursor: "pointer" }}>
                <h2>Earlier lessons</h2>
                <span className="muted" style={{ fontSize: 14 }}>{past.length}</span>
              </summary>
              <ol className="pick">
                {past.map((l) => (
                  <li key={l.id}>
                    <span className="n">{l.unit ?? "—"}</span>
                    <Link href={`/tutor/students/${id}/lesson?lesson=${l.id}`} className="pickopen" style={{ textAlign: "left" }}>
                      {l.title || `Unit ${l.unit}`}
                      <span className="muted" style={{ fontSize: 13 }}>
                        {" "}
                        · {l.status === "taught" ? "taught" : "being prepared"}
                        {l.review_assignment_id ? " · review sent" : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
      </main>
    </>
  );
}
