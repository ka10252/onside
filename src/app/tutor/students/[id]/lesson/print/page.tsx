import { notFound } from "next/navigation";
import { Notes } from "@/components/Notes";
import { PrintButton } from "@/components/PrintButton";
import { unitBrief } from "@/lib/lesson";
import { requireUser } from "@/lib/session";

// The revision notes alone, laid out for paper. The browser's "Save as PDF" turns this into the
// handout; no questions are on it, so it can be given to the student before a lesson.
export default async function PrintNotesPage({ searchParams }: PageProps<"/tutor/students/[id]/lesson/print">) {
  await requireUser("tutor");
  const { unit } = (await searchParams) as { unit?: string };
  const brief = Number(unit) ? await unitBrief(Number(unit)) : null;
  if (!brief?.notes?.body) notFound();

  return (
    <main className="sheetpage">
      <div className="noprint">
        <PrintButton />
      </div>
      <article className="printsheet">
        <Notes text={brief.notes.body} />
      </article>
    </main>
  );
}
