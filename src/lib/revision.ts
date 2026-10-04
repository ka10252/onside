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
    `SELECT b.unit, u.title, b.headline, b.updated_at, n.sent_at AS taught_at, r.read_at
       FROM unit_briefs b
       JOIN units u ON u.number = b.unit
       JOIN note_releases n ON n.unit = b.unit AND n.student_id = ?
       LEFT JOIN note_reads r ON r.student_id = n.student_id AND r.unit = b.unit
      WHERE b.body <> ''
      ORDER BY n.sent_at DESC`,
    studentId,
  );
}

/** Opens these units' notes to the student. Sending the same unit twice changes nothing. */
export async function releaseNotes(studentId: string, units: number[]) {
  for (const unit of units) {
    await run(
      `INSERT INTO note_releases (student_id, unit, sent_at) VALUES (?, ?, ?)
       ON CONFLICT (student_id, unit) DO NOTHING`,
      studentId,
      unit,
      new Date().toISOString(),
    );
  }
}

/** Takes a unit's notes back, for a unit sent by mistake. */
export async function unreleaseNotes(studentId: string, unit: number) {
  await run("DELETE FROM note_releases WHERE student_id = ? AND unit = ?", studentId, unit);
}

/** Which units this student can read, for the tutor's screens. */
export async function releasedUnits(studentId: string): Promise<Map<number, string>> {
  const rows = await all<{ unit: number; sent_at: string }>("SELECT unit, sent_at FROM note_releases WHERE student_id = ?", studentId);
  return new Map(rows.map((r) => [r.unit, r.sent_at]));
}

export async function studentNote(studentId: string, unit: number): Promise<{ unit: number; title: string; body: string } | null> {
  return (await one<{ unit: number; title: string; body: string }>(
    `SELECT b.unit, u.title, b.body
       FROM unit_briefs b
       JOIN units u ON u.number = b.unit
      WHERE b.unit = ? AND b.body <> ''
        AND EXISTS (SELECT 1 FROM note_releases n WHERE n.unit = b.unit AND n.student_id = ?)`,
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
