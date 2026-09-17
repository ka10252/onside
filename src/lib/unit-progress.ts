import "server-only";
import { db } from "./db";

export type UnitProgress = { unit: number; title: string; total: number; sent: number; answered: number };

/** Unit test questions per unit: how many a student has been sent and has answered. */
export function unitTestProgress(studentId: string): UnitProgress[] {
  return db()
    .prepare(
      `SELECT u.number AS unit, u.title,
              COUNT(q.id) AS total,
              COUNT(DISTINCT CASE WHEN EXISTS (
                SELECT 1 FROM assignments a JOIN set_items i ON i.set_id = a.set_id
                 WHERE a.student_id = @s AND i.question_id = q.id) THEN q.id END) AS sent,
              COUNT(DISTINCT CASE WHEN EXISTS (
                SELECT 1 FROM responses r WHERE r.student_id = @s AND r.question_id = q.id AND r.submitted_at IS NOT NULL
                   AND (COALESCE(r.final_text, '') <> '' OR r.attempts <> '[]' OR r.photo_path IS NOT NULL)) THEN q.id END) AS answered
         FROM units u JOIN questions q ON q.unit_id = u.id AND q.source = 'unit-test'
        GROUP BY u.number ORDER BY u.number`,
    )
    .all({ s: studentId }) as UnitProgress[];
}
