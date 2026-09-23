import { notFound } from "next/navigation";
import { Crumbs } from "@/components/Crumbs";
import { Nav, TUTOR_TABS } from "@/components/Nav";
import { PastQuestionCard } from "@/components/PastQuestionCard";
import { QuestionCard } from "@/components/QuestionCard";
import { getUnit, pastContext, type Block } from "@/lib/content";
import { requireUser } from "@/lib/session";

const PAPERS = [
  { key: "all", label: "All papers" },
  { key: "1", label: "Paper 1" },
  { key: "2", label: "Paper 2" },
  { key: "3", label: "Paper 3" },
];

export default async function UnitPage({ params, searchParams }: PageProps<"/tutor/bank/[unit]">) {
  const user = await requireUser("tutor");
  const { unit: unitParam } = await params;
  const { paper = "all", level = "all" } = (await searchParams) as { paper?: string; level?: string };
  const data = await getUnit(Number(unitParam));
  if (!data) notFound();
  const { unit, part, sections, concepts, questions, pastQuestions, checklists, corrections } = data;
  const past = pastQuestions.filter(
    (q) =>
      (paper === "all" || q.paper_style?.startsWith(`P${paper}`)) &&
      (level === "all" || (level === "HL" ? !q.past.paper.includes("-SL") : q.past.paper.includes("SL"))),
  );
  const keys = [...new Set(past.map((q) => `${q.past.paper}|${q.past.question}`))];
  const contexts = new Map<string, Block[]>(
    await Promise.all(
      keys.map(async (key) => {
        const [paper, question] = key.split("|") as [string, string];
        return [key, await pastContext(paper, question)] as const;
      }),
    ),
  );
  const href = (p: string, l: string) => `/tutor/bank/${unit.number}?paper=${p}&level=${l}#past`;
  const conceptMap = new Map(concepts.map((c) => [c.id, c]));
  const checklistMap = new Map(checklists.map((c) => [c.id, c]));

  return (
    <>
      <Nav user={user} tabs={TUTOR_TABS} active="/tutor/bank" />
      <main className="page">
        <div className="wrap stack">
          <div>
            <Crumbs items={[{ href: "/tutor/bank", label: "Question bank" }, { label: part.name }]} />
            <div className="phead" style={{ marginBottom: 0 }}>
              <div>
                <h1>{unit.title}</h1>
                <p>
                  {part.name} · {questions.length} Onside questions · {pastQuestions.length} past-paper questions ·{" "}
                  {concepts.length} concepts
                </p>
              </div>
            </div>
          </div>

          {unit.exam_weight && <div className="banner">{unit.exam_weight}</div>}

          {corrections.length > 0 && (
            <section className="card">
              <div className="card-hd">
                <h2>Corrections to your notes</h2>
              </div>
              <div style={{ padding: "16px 24px" }}>
                <dl className="kv" style={{ gridTemplateColumns: "240px minmax(0, 1fr)" }}>
                  {corrections.map((c, i) => (
                    <div key={i} style={{ display: "contents" }}>
                      <dt>{c.location}</dt>
                      <dd>{c.issue}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </section>
          )}

          {questions.length > 0 && (
            <div className="qcgrid">
              {questions.map((q) => (
                <QuestionCard key={q.id} q={q} concepts={conceptMap} checklists={checklistMap} />
              ))}
            </div>
          )}

          {pastQuestions.length > 0 && (
            <section className="stack" id="past" style={{ gap: 14 }}>
              <div className="card-hd card" style={{ borderRadius: 12 }}>
                <h2>Past-paper questions · {past.length}</h2>
                <div className="filters">
                  <nav className="seglinks" aria-label="Paper">
                    {PAPERS.map((p) => (
                      <a key={p.key} href={href(p.key, level)} className={paper === p.key ? "on" : undefined}>{p.label}</a>
                    ))}
                  </nav>
                  <nav className="seglinks" aria-label="Level">
                    {["all", "HL", "SL"].map((l) => (
                      <a key={l} href={href(paper, l)} className={level === l ? "on" : undefined}>{l === "all" ? "HL + SL" : l}</a>
                    ))}
                  </nav>
                </div>
              </div>
              {past.map((q) => (
                <PastQuestionCard key={q.id} q={q} context={contexts.get(`${q.past.paper}|${q.past.question}`) ?? []} />
              ))}
            </section>
          )}

          <section className="card">
            <div className="card-hd">
              <h2>Concepts</h2>
            </div>
            <div className="scrollx">
              <table className="t">
                <thead>
                  <tr>
                    <th>Section</th>
                    <th>Concept</th>
                    <th>Definition</th>
                  </tr>
                </thead>
                <tbody>
                  {concepts.map((c) => (
                    <tr key={c.id}>
                      <td className="muted" style={{ whiteSpace: "nowrap" }}>
                        {c.section_id} {sections.find((s) => s.id === c.section_id)?.title}
                      </td>
                      <td className="concept">{c.term}</td>
                      <td>{c.definition ?? <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
