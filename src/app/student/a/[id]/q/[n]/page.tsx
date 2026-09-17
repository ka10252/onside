import { notFound, redirect } from "next/navigation";
import { Nav, STUDENT_TABS } from "@/components/Nav";
import { Solve } from "@/components/solve/Solve";
import { requireUser } from "@/lib/session";
import {
  deadline,
  ensureResponse,
  getAssignment,
  hasAnswer,
  isLocked,
  responsesFor,
  setQuestions,
  startAssignment,
  studentResponse,
  studentView,
} from "@/lib/student";

export default async function SolvePage({ params }: PageProps<"/student/a/[id]/q/[n]">) {
  const user = await requireUser("student");
  const { id, n } = await params;
  const a = getAssignment(id, user.id);
  if (!a) notFound();
  if (isLocked(a)) redirect(`/student/a/${id}/done`);
  const questions = setQuestions(a.set_id);
  const position = Number(n);
  if (!Number.isInteger(position) || position < 1 || position > questions.length) notFound();

  startAssignment(a);
  const q = questions[position - 1]!;
  const r = ensureResponse(a, q, position);
  const responses = responsesFor(a.id);
  const answered = questions.map((x) => {
    const row = responses.get(x.id);
    return row ? hasAnswer(row) : false;
  });

  return (
    <>
      <Nav user={user} tabs={STUDENT_TABS} active="/student" />
      <Solve
        key={q.id}
        assignment={{ id: a.id, title: a.title, helper: a.helper, deadline: deadline(a) }}
        position={position}
        total={questions.length}
        answered={answered}
        q={studentView(q, r.id)}
        r={studentResponse(r, q)}
      />
    </>
  );
}
