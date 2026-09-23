import { notFound, redirect } from "next/navigation";
import { Crumbs } from "@/components/Crumbs";
import { Nav, TUTOR_TABS } from "@/components/Nav";
import { SetBuilder } from "@/components/SetBuilder";
import { bankParts, bankQuestions, getSet, setIsLocked } from "@/lib/admin";
import { requireUser } from "@/lib/session";

export default async function EditSetPage({ params }: PageProps<"/tutor/sets/[id]/edit">) {
  const user = await requireUser("tutor");
  const { id } = await params;
  const set = await getSet(id);
  if (!set) notFound();
  if (await setIsLocked(id)) redirect(`/tutor/sets/${id}`);

  return (
    <>
      <Nav user={user} tabs={TUTOR_TABS} active="/tutor/sets" />
      <main className="page">
        <div className="wrap">
          <Crumbs items={[{ href: "/tutor/sets", label: "Sets" }, { href: `/tutor/sets/${id}`, label: set.title }, { label: "Edit" }]} />
          <div className="phead">
            <div>
              <h1>Edit set</h1>
            </div>
          </div>
          <SetBuilder
            questions={await bankQuestions()}
            parts={await bankParts()}
            initial={{
              id,
              title: set.title,
              helper: set.helper,
              timeLimitMin: set.time_limit_min,
              questionIds: set.items.map((q) => q.id),
            }}
          />
        </div>
      </main>
    </>
  );
}
