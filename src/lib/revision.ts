import "server-only";
import { all, one } from "./db";

/**
 * The revision notes a student is allowed to read. A unit's note opens once the lesson on it has
 * been taught: before that it would hand over the recap the lesson is built on. Only the student
 * half of the note is ever read here — the tutor half stays in `unit_briefs.tutor`.
 */
export type StudentNote = { unit: number; title: string; headline: string; taught_at: string; updated_at: string };

export function studentNotes(studentId: string): Promise<StudentNote[]> {
  return all<StudentNote>(
    `SELECT b.unit, u.title, b.headline, b.updated_at, MIN(l.taught_at) AS taught_at
       FROM unit_briefs b
       JOIN units u ON u.number = b.unit
       JOIN lessons l ON l.unit = b.unit AND l.student_id = ? AND l.status = 'taught' AND l.taught_at IS NOT NULL
      WHERE b.body <> ''
      GROUP BY b.unit, u.title, b.headline, b.updated_at
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
