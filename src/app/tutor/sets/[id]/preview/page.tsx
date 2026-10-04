import Link from "next/link";
import { notFound } from "next/navigation";
import { Crumbs } from "@/components/Crumbs";
import { Nav, TUTOR_TABS } from "@/components/Nav";
import { Blocks, Rich } from "@/components/Rich";
import { one } from "@/lib/db";
import { FORMAT_LABEL } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { setQuestions, studentView, type StudentQuestion } from "@/lib/student";

// A set as the student will meet it: the question, the extracts, and the boxes they type into.
// Nothing here can be answered — it is the tutor's look at a set before it goes out.
export default async function SetPreviewPage({ params }: PageProps<"/tutor/sets/[id]/preview">) {
  const user = await requireUser("tutor");
  const { id } = await params;
  const set = await one<{ id: string; title: string; helper: string; time_limit_min: number | null }>(
    "SELECT id, title, helper, time_limit_min FROM sets WHERE id = ?",
    id,
  );
  if (!set) notFound();
  const questions = await setQuestions(set.id);
  const views = await Promise.all(questions.map((q) => studentView(q)));

  return (
    <>
      <Nav user={user} tabs={TUTOR_TABS} active="/tutor/sets" />
      <main className="page">
        <div className="wrap stack">
          <div>
            <Crumbs items={[{ href: "/tutor/sets", label: "Sets" }, { label: set.title }]} />
            <div className="phead" style={{ marginBottom: 0 }}>
              <div>
                <h1>{set.title}</h1>
                <p>
                  What the student sees · {views.length} {views.length === 1 ? "question" : "questions"} ·{" "}
                  {set.helper === "on" ? "Helper on" : "Helper off"}
                  {set.time_limit_min ? ` · ${set.time_limit_min} min` : ""}
                </p>
              </div>
              <Link href={`/tutor/sets/${set.id}`} className="btn">
                Edit the set
              </Link>
            </div>
          </div>

          <ol className="previewlist">
            {views.map((q, i) => (
              <li key={q.id}>
                <Ask q={q} n={i + 1} helper={set.helper === "on"} />
              </li>
            ))}
          </ol>
        </div>
      </main>
    </>
  );
}

/** One question, laid out the way the solving screen lays it out, with nothing live. */
function Ask({ q, n, helper }: { q: StudentQuestion; n: number; helper: boolean }) {
  // The same rules the solving screen uses, so this is what the student will meet.
  const isCalc = q.format === "calculation";
  const isDiagram = q.format === "diagram" || Boolean(q.label && /\b(diagram|sketch|draw)\b/i.test(q.prompt));
  const oneLine = !isDiagram && (isCalc || q.marks <= 2);
  const written = q.mode === "written";
  const canPhoto = written && !oneLine;

  return (
    <article className="card cardbody stack" style={{ gap: 12 }}>
      <p className="meta" style={{ margin: 0 }}>
        <b>Question {n}</b>
        {q.label && <span className="pill ink">{q.label}</span>}
        <span>{FORMAT_LABEL[q.format]}</span>
        <span>
          {q.marks} {q.marks === 1 ? "mark" : "marks"}
        </span>
        {helper && q.hasHints && <span className="pill gray">Hints available</span>}
      </p>

      {q.context.length > 0 && (
        <details className="sub">
          <summary>Extracts and data ({q.context.length})</summary>
          <Blocks blocks={q.context} />
        </details>
      )}
      {q.lead.length > 0 && <Blocks blocks={q.lead} />}

      <p className="qtext" style={{ margin: 0 }}>
        <Rich text={q.prompt} />
      </p>

      {q.options && q.options.length > 0 && (
        <ol className="choices readback">
          {q.options.map((o) => (
            <li key={o.id} className="choice">
              <span className="k">{o.id.toUpperCase()}</span>
              <span className="grow">{o.text}</span>
            </li>
          ))}
        </ol>
      )}

      {q.parts && q.parts.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          {q.parts.map((p, i) => (
            <label key={i} className="opt" style={{ gap: 8 }}>
              <span className="muted" style={{ fontSize: 13, minWidth: 80 }}>{p.label}</span>
              <input className="in sm" disabled placeholder={p.unit} />
            </label>
          ))}
        </div>
      )}

      {q.planPrompts && q.planPrompts.length > 0 && (
        <div className="sub" style={{ padding: 12 }}>
          <span className="qlabel">Plan</span>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {q.planPrompts.map((p, i) => (
              <li key={i} className="muted" style={{ fontSize: 14 }}>
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}

      {canPhoto && (
        <div className="field">
          <label>{isDiagram ? "Upload your diagram and explanation" : "Photo of your work"}</label>
          <input type="file" disabled accept="image/jpeg,image/png,image/webp,application/pdf" />
          <span className="note">
            {isDiagram
              ? "Draw it on paper and photograph it. Label the axes and every curve, and write the explanation beside the diagram."
              : "If you wrote it on paper, photograph it here."}
          </span>
        </div>
      )}

      {/* A diagram question is answered on paper, so there is no box to type in. */}
      {written && !isDiagram && (
        <label className="stack" style={{ gap: 4 }}>
          <span className="qlabel">{isCalc ? "Final answer" : "Your answer"}</span>
          <textarea className="working" style={{ minHeight: 120 }} disabled placeholder="The student types here." />
        </label>
      )}

      {!written && (!q.options || q.options.length === 0) && !q.parts?.length && (
        <label className="stack" style={{ gap: 4 }}>
          <span className="qlabel">Your answer</span>
          <input className="in" disabled placeholder="The student types here." />
        </label>
      )}
    </article>
  );
}
