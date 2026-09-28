import Link from "next/link";
import { notFound } from "next/navigation";
import { Nav, STUDENT_TABS } from "@/components/Nav";
import { Results } from "@/components/student/Results";
import { requireUser } from "@/lib/session";
import { finalizeAssignment, getAssignment, isLocked } from "@/lib/student";

// A finished set, for review: the student's own answers, results, and (once the tutor has sent marks)
// marks, the tutor's comments and the answers.
export default async function ResultsPage({ params, searchParams }: PageProps<"/student/a/[id]/done">) {
  const user = await requireUser("student");
  const { id } = await params;
  const { show, unit } = (await searchParams) as { show?: string; unit?: string };
  let a = await getAssignment(id, user.id);
  if (!a) notFound();
  if (isLocked(a) && (a.status === "in_progress" || a.status === "not_started")) {
    await finalizeAssignment(a.id); // time ran out
    a = (await getAssignment(id, user.id))!;
  }
  if (!isLocked(a)) {
    return (
      <>
        <Nav user={user} tabs={STUDENT_TABS} active="/student" />
        <main className="page">
          <div className="narrow">
            <div className="card empty-state">
              <h1 className="serif" style={{ margin: 0, fontSize: 36, fontWeight: 400 }}>Not submitted yet</h1>
              <Link href={`/student/a/${a.id}`} className="btn primary" style={{ marginTop: 12 }}>
                Back to the assignment
              </Link>
            </div>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Nav user={user} tabs={STUDENT_TABS} active="/student" />
      <Results a={a} basePath={`/student/a/${a.id}/done`} back={{ href: "/student", label: "Assignments" }} show={show} unit={unit} />
    </>
  );
}
