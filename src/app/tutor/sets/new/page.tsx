import { Crumbs } from "@/components/Crumbs";
import { Nav, TUTOR_TABS } from "@/components/Nav";
import { SetBuilder, type BuilderStart } from "@/components/SetBuilder";
import { bankParts, bankQuestions, listStudents } from "@/lib/admin";
import type { Source } from "@/lib/bank-filter";
import { requireUser } from "@/lib/session";

const SOURCES: Source[] = ["onside", "test", "ai", "P1", "P2", "P3"];

// Optional prefill: ?student=<id>&unit=7&unit=8&source=test&count=10
export default async function NewSetPage({ searchParams }: PageProps<"/tutor/sets/new">) {
  const user = await requireUser("tutor");
  const sp = await searchParams;
  const list = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
  const students = (await listStudents())
    .filter((s) => !s.archived_at)
    .map((s) => ({ id: s.id, name: s.name }));
  const studentId = list(sp.student)[0];
  const start: BuilderStart = {
    studentId: students.some((s) => s.id === studentId) ? studentId : undefined,
    units: list(sp.unit).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 20),
    sources: list(sp.source).filter((s): s is Source => SOURCES.includes(s as Source)),
    count: Math.min(30, Math.max(0, Number(list(sp.count)[0]) || 0)) || undefined,
  };

  return (
    <>
      <Nav user={user} tabs={TUTOR_TABS} active="/tutor/sets" />
      <main className="page">
        <div className="wrap">
          <Crumbs items={[{ href: "/tutor/sets", label: "Sets" }, { label: "New set" }]} />
          <div className="phead">
            <div>
              <h1>New set</h1>
            </div>
          </div>
          <SetBuilder questions={await bankQuestions()} parts={await bankParts()} students={students} start={start} />
        </div>
      </main>
    </>
  );
}
