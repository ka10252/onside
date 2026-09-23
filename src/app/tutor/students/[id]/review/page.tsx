import { notFound, redirect } from "next/navigation";
import { Crumbs } from "@/components/Crumbs";
import { Nav, TUTOR_TABS } from "@/components/Nav";
import { ReviewBuilder } from "@/components/review/ReviewBuilder";
import { getStudent } from "@/lib/admin";
import { all, one } from "@/lib/db";
import { proposals } from "@/lib/retry";
import { requireUser } from "@/lib/session";

export default async function ReviewQuizPage({ params, searchParams }: PageProps<"/tutor/students/[id]/review">) {
  const user = await requireUser("tutor");
  const { id } = await params;
  const { from } = (await searchParams) as { from?: string };
  const student = await getStudent(id);
  if (!student || !from) notFound();
  const a = await one<{ id: string; status: string; title: string }>(
    "SELECT a.id, a.status, s.title FROM assignments a JOIN sets s ON s.id = a.set_id WHERE a.id = ? AND a.student_id = ?",
    from,
    id,
  );
  if (!a) notFound();
  // A review quiz is built from confirmed marks, so the marks must be sent first.
  if (a.status !== "reviewed") redirect(`/tutor/students/${id}/a/${a.id}`);
  const [sent, formatRows, props] = await Promise.all([
    one<{ created_at: string }>("SELECT created_at FROM sets WHERE review_of = ? ORDER BY created_at DESC LIMIT 1", a.id),
    all<{ id: string; format: string }>(
      "SELECT q.id, q.format FROM set_items i JOIN questions q ON q.id = i.question_id JOIN assignments a ON a.set_id = i.set_id WHERE a.id = ?",
      a.id,
    ),
    proposals(a.id),
  ]);
  const formats = new Map(formatRows.map((r) => [r.id, r.format]));
  const list = props.map((p) => ({ ...p, format: formats.get(p.questionId) ?? "short_answer" }));
  const first = student.name.split(" ")[0];

  return (
    <>
      <Nav user={user} tabs={TUTOR_TABS} active="/tutor" />
      <main className="page">
        <div className="wrap">
          <Crumbs
            items={[
              { href: "/tutor", label: "Students" },
              { href: `/tutor/students/${id}`, label: student.name },
              { href: `/tutor/students/${id}/a/${a.id}`, label: a.title },
              { label: "Review quiz" },
            ]}
          />
          <div className="phead">
            <div>
              <h1>Review quiz for {first}</h1>
              <p>Each question {first} lost marks on or needed help with comes back as a different question on the same topic.</p>
              {sent && (
                <p className="formmsg bad" role="status">
                  You already sent a review quiz for this set on{" "}
                  {new Date(sent.created_at).toLocaleDateString("en-SG", { day: "numeric", month: "short" })}. Sending again adds a second one.
                </p>
              )}
            </div>
          </div>
          <ReviewBuilder
            studentId={id}
            studentName={student.name}
            fromAssignmentId={a.id}
            defaultTitle={`Review: ${a.title}`.slice(0, 100)}
            proposals={list}
          />
        </div>
      </main>
    </>
  );
}
