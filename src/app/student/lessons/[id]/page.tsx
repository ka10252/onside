import { notFound } from "next/navigation";
import { Nav } from "@/components/Nav";
import { LessonRecord } from "@/components/LessonRecord";
import { requireUser } from "@/lib/session";
import { studentTabs } from "@/lib/revision";
import { lessonReport, reportIsSent } from "@/lib/lesson-report";

/** One lesson's record. Readable only once the tutor has sent it. */
export default async function StudentLessonPage({ params }: PageProps<"/student/lessons/[id]">) {
  const user = await requireUser("student");
  const { id } = await params;
  const [sent, report, tabs] = await Promise.all([reportIsSent(id, user.id), lessonReport(id), studentTabs(user.id)]);
  if (!sent || !report) notFound();

  return (
    <>
      <Nav user={user} tabs={tabs} active="/student/lessons" />
      <main className="page">
        <div className="wrap stack">
          <LessonRecord report={report} />
        </div>
      </main>
    </>
  );
}
