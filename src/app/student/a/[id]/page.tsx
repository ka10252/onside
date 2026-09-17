import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EyeIcon } from "@/components/Icons";
import { Nav, STUDENT_TABS } from "@/components/Nav";
import { formatDue } from "@/components/StatusPill";
import { requireUser } from "@/lib/session";
import { getAssignment, hasAnswer, isLocked, responsesFor, setQuestions } from "@/lib/student";

// Start screen for a new set; a set in progress continues at the first unfinished question.
export default async function AssignmentStart({ params }: PageProps<"/student/a/[id]">) {
  const user = await requireUser("student");
  const { id } = await params;
  const a = getAssignment(id, user.id);
  if (!a) notFound();
  if (isLocked(a)) redirect(`/student/a/${id}/done`);
  const questions = setQuestions(a.set_id);
  if (a.status === "in_progress") {
    const responses = responsesFor(a.id);
    const next = questions.findIndex((q) => {
      const row = responses.get(q.id);
      return !row || !hasAnswer(row);
    });
    redirect(`/student/a/${id}/q/${next < 0 ? questions.length : next + 1}`);
  }
  const marks = questions.reduce((s, q) => s + q.marks, 0);

  return (
    <>
      <Nav user={user} tabs={STUDENT_TABS} active="/student" />
      <main className="page">
        <div className="narrow stack">
          <div className="phead" style={{ marginBottom: 0 }}>
            <div>
              <h1>{a.title}</h1>
              <p>
                {questions.length} questions · {marks} marks
                {a.due_at ? ` · Due ${formatDue(a.due_at)}` : ""}
              </p>
            </div>
          </div>
          <section className="card cardbody stack" style={{ gap: 14 }}>
            <ul className="summary">
              <li>{a.helper === "on" ? "The AI Helper and hints are available. Hints lower the most you can score." : "No Helper and no hints in this set."}</li>
              {a.helper === "off" && a.time_limit_min && (
                <li>
                  You have {a.time_limit_min} minutes. The timer starts when you open the first question, and the set is submitted when time runs out.
                </li>
              )}
              <li>Your answers save as you go. You can leave and come back, and change any answer until you submit.</li>
              <li>Press Submit assignment when you have finished every question. Answers are checked after that.</li>
            </ul>
            <p className="dtrans" style={{ margin: 0 }}>
              <EyeIcon /> Your tutor can see how you use the AI Helper, and when you paste text or leave this tab.
            </p>
            <div>
              <Link href={`/student/a/${id}/q/1`} className="btn primary lg">
                Start
              </Link>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
