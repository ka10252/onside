import Link from "next/link";
import { notFound } from "next/navigation";
import { Nav, STUDENT_TABS } from "@/components/Nav";
import { Notes } from "@/components/Notes";
import { PrintButton } from "@/components/PrintButton";
import { requireUser } from "@/lib/session";
import { studentNote } from "@/lib/revision";

// One unit's notes, laid out the way the handout is, so "Save as PDF" gives the student the same
// pages the tutor prints. Only the student half of the note is read.
export default async function StudentNotePage({ params }: PageProps<"/student/notes/[unit]">) {
  const user = await requireUser("student");
  const { unit } = await params;
  const note = Number(unit) ? await studentNote(user.id, Number(unit)) : null;
  if (!note) notFound();

  return (
    <>
      <Nav user={user} tabs={STUDENT_TABS} active="/student/notes" />
      <main className="sheetpage">
        <div className="noprint" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <Link href="/student/notes" className="btn ghost sm">
            All notes
          </Link>
          <PrintButton />
        </div>
        <article className="printsheet">
          <Notes text={note.body} />
        </article>
      </main>
    </>
  );
}
