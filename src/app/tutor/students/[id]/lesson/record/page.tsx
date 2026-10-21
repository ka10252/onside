import { notFound } from "next/navigation";
import Link from "next/link";
import { Nav, TUTOR_TABS } from "@/components/Nav";
import { LessonRecord } from "@/components/LessonRecord";
import { requireUser } from "@/lib/session";
import { lessonReport } from "@/lib/lesson-report";

/** The lesson record as the student will read it, before deciding to send it. */
export default async function LessonRecordPreview({ params, searchParams }: PageProps<"/tutor/students/[id]/lesson/record">) {
  const user = await requireUser("tutor");
  const { id } = await params;
  const { lesson } = (await searchParams) as { lesson?: string };
  if (!lesson) notFound();
  const report = await lessonReport(lesson);
  if (!report) notFound();

  return (
    <>
      <Nav user={user} tabs={TUTOR_TABS} active="/tutor" />
      <main className="page">
        <div className="wrap stack">
          <p className="note" style={{ margin: 0 }}>
            What the student sees. Nothing here is editable.{" "}
            <Link href={`/tutor/students/${id}/lesson?lesson=${lesson}`}>Back to the lesson</Link>
          </p>
          <LessonRecord report={report} />
        </div>
      </main>
    </>
  );
}
