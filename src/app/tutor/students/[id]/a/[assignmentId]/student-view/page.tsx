import Link from "next/link";
import { notFound } from "next/navigation";
import { Nav, TUTOR_TABS } from "@/components/Nav";
import { Results } from "@/components/student/Results";
import { one } from "@/lib/db";
import { requireUser } from "@/lib/session";

// The results screen exactly as the student reads it, so the tutor can see what was sent.
export default async function StudentViewPage({ params, searchParams }: PageProps<"/tutor/students/[id]/a/[assignmentId]/student-view">) {
  const user = await requireUser("tutor");
  const { id, assignmentId } = await params;
  const { show, unit } = (await searchParams) as { show?: string; unit?: string };
  const a = await one<{ id: string; set_id: string; title: string; status: string; student_name: string }>(
    `SELECT a.id, a.set_id, s.title, a.status, u.name AS student_name
       FROM assignments a JOIN sets s ON s.id = a.set_id JOIN users u ON u.id = a.student_id
      WHERE a.id = ? AND a.student_id = ?`,
    assignmentId,
    id,
  );
  if (!a) notFound();
  const first = a.student_name.split(" ")[0];
  const back = `/tutor/students/${id}/a/${assignmentId}`;

  return (
    <>
      <Nav user={user} tabs={TUTOR_TABS} active="/tutor" />
      <div className="wrap" style={{ paddingTop: 20 }}>
        <div className="asstudent">
          <span>
            This is {first}&apos;s own screen, exactly as they read it.{" "}
            {a.status === "reviewed" ? "The marks have been sent." : "The marks aren't sent yet, so they see none here."}
          </span>
          <Link href={back} className="btn sm">
            Back to marking
          </Link>
        </div>
      </div>
      <Results a={a} basePath={`${back}/student-view`} back={{ href: back, label: "Back to marking" }} show={show} unit={unit} seenBy="tutor" />
    </>
  );
}
