import "server-only";
import type { Tab } from "@/components/Nav";
import { all, one, run } from "./db";

/**
 * The revision notes a student is allowed to read. A unit's note opens once the lesson on it has
 * been taught: before that it would hand over the recap the lesson is built on. Only the student
 * half of the note is ever read here — the tutor half stays in `unit_briefs.tutor`.
 */
export type StudentNote = { unit: number; title: string; headline: string; taught_at: string; updated_at: string; read_at: string | null };

export function studentNotes(studentId: string): Promise<StudentNote[]> {
  return all<StudentNote>(
    `SELECT b.unit, u.title, b.headline, b.updated_at, MIN(l.taught_at) AS taught_at, r.read_at
       FROM unit_briefs b
       JOIN units u ON u.number = b.unit
       JOIN lessons l ON l.unit = b.unit AND l.student_id = ? AND l.status = 'taught' AND l.taught_at IS NOT NULL
       LEFT JOIN note_reads r ON r.student_id = l.student_id AND r.unit = b.unit
      WHERE b.body <> ''
      GROUP BY b.unit, u.title, b.headline, b.updated_at, r.read_at
      ORDER BY MIN(l.taught_at) DESC`,
    studentId,
  );
}

export async function studentNote(studentId: string, unit: number): Promise<{ unit: number; title: string; body: string } | null> {
  return (await one<{ unit: number; title: string; body: string }>(
    `SELECT b.unit, u.title, b.body
       FROM unit_briefs b
       JOIN units u ON u.number = b.unit
      WHERE b.unit = ? AND b.body <> ''
        AND EXISTS (SELECT 1 FROM lessons l
                     WHERE l.unit = b.unit AND l.student_id = ? AND l.status = 'taught' AND l.taught_at IS NOT NULL)`,
    unit,
    studentId,
  )) ?? null;
}

/** Opening a unit's notes is what reading them means: the tutor can see it, and the mark clears. */
export async function markNoteRead(studentId: string, unit: number) {
  await run(
    `INSERT INTO note_reads (student_id, unit, read_at) VALUES (?, ?, ?)
     ON CONFLICT (student_id, unit) DO UPDATE SET read_at = excluded.read_at`,
    studentId,
    unit,
    new Date().toISOString(),
  );
}

/** When the student last opened this unit's notes, for the tutor's screen. */
export async function noteRead(studentId: string, unit: number): Promise<string | null> {
  return (await one<{ read_at: string }>("SELECT read_at FROM note_reads WHERE student_id = ? AND unit = ?", studentId, unit))?.read_at ?? null;
}

/** The student's tabs, with a mark on Revision notes while a note is waiting to be read. */
export async function studentTabs(studentId: string): Promise<Tab[]> {
  const notes = await studentNotes(studentId);
  return [
    { href: "/student", label: "Assignments" },
    { href: "/student/notes", label: "Revision notes", dot: notes.some(unread) },
  ];
}

/** Not opened since the lesson, or not opened since the notes were last changed. */
export const unread = (n: StudentNote) => !n.read_at || n.read_at < n.updated_at;
