import { notFound } from "next/navigation";
import { Notes } from "@/components/Notes";
import { PrintButton } from "@/components/PrintButton";
import { lessonNotes } from "@/lib/lesson";
import { lessonOf } from "@/lib/lesson-plan";
import { requireUser } from "@/lib/session";

// The lesson's revision notes alone, laid out for paper. The browser's "Save as PDF" turns this into the
// handout; no questions are on it, so it can be given to the student before a lesson.
export default async function PrintNotesPage({ searchParams }: PageProps<"/tutor/students/[id]/lesson/print">) {
  await requireUser("tutor");
  const { unit } = (await searchParams) as { unit?: string };
  const n = Number(unit);
  // One lesson, one handout: a lesson that covers two units prints both, a page apart.
  const notes = n ? (await lessonNotes(lessonOf(n)?.units ?? [n])).filter((x) => x.body) : [];
  if (notes.length === 0) notFound();

  return (
    <main className="sheetpage">
      <div className="noprint">
        <PrintButton />
      </div>
      {notes.map((note, i) => (
        <article key={note.unit} className={`printsheet${i > 0 ? " newpage" : ""}`}>
          <Notes text={note.body} />
        </article>
      ))}
    </main>
  );
}
