import "server-only";
import { all, one, run } from "./db";
import { getLesson, type Outcome } from "./lesson";
import { unitsOfLesson } from "./lesson-plan";
import { isPast, type Question } from "./content";

/**
 * The record of a lesson, as the student reads it afterwards: every question it covered, how each
 * one went, and what they wrote where they wrote anything. It is not work to do — the sets are
 * that — so it is sent on its own and can be taken back (Jin, 2026-10-21).
 */
export type ReportQuestion = {
  id: string;
  label: string | null;
  marks: number;
  prompt: string;
  outcome: Outcome | null;
  /** What the student wrote, where the question went out as an assignment and they answered it. */
  answer: string | null;
  /** The marks they were given, once confirmed. */
  got: number | null;
};

export type ReportSection = { title: string; note: string; questions: ReportQuestion[] };

export type LessonReport = {
  lessonId: string;
  title: string;
  units: number[];
  taughtAt: string | null;
  sentAt: string | null;
  sections: ReportSection[];
};

/** Everything this student has written, by question, so the record can show it beside each one. */
async function answersOf(studentId: string): Promise<Map<string, { answer: string | null; got: number | null }>> {
  const rows = await all<{ question_id: string; answer: string | null; got: number | null }>(
    `SELECT r.question_id,
            COALESCE(NULLIF(r.final_text, ''), NULLIF(r.working_text, ''), r.rewrite_text) AS answer,
            COALESCE((r.tutor_mark::jsonb ->> 'marks')::float, r.auto_marks) AS got
       FROM responses r WHERE r.student_id = ?`,
    studentId,
  );
  return new Map(rows.map((r) => [r.question_id, { answer: r.answer, got: r.got }]));
}

async function questionsOf(ids: string[]): Promise<Map<string, { marks: number; prompt: string; label: string | null }>> {
  if (ids.length === 0) return new Map();
  const holes = ids.map(() => "?").join(", ");
  const rows = await all<{ id: string; marks: number; data: string }>(
    `SELECT id, marks, data FROM questions WHERE id IN (${holes})`,
    ...ids,
  );
  return new Map(
    rows.map((r) => {
      const q = JSON.parse(r.data) as Question;
      return [r.id, { marks: r.marks, prompt: q.prompt, label: isPast(q) ? q.past.label : null }];
    }),
  );
}

export async function lessonReport(lessonId: string): Promise<LessonReport | null> {
  const lesson = await getLesson(lessonId);
  if (!lesson) return null;

  const [reviewItems, practiceItems] = await Promise.all([
    lesson.review_set_id
      ? all<{ question_id: string; outcome: Outcome | null }>(
          `SELECT i.question_id, o.outcome FROM set_items i
             LEFT JOIN review_outcomes o ON o.lesson_id = ? AND o.question_id = i.question_id
            WHERE i.set_id = ? ORDER BY i.position`,
          lessonId,
          lesson.review_set_id,
        )
      : Promise.resolve([]),
    all<{ question_id: string; outcome: Outcome | null }>(
      `SELECT i.question_id, o.outcome FROM practice_sets p JOIN set_items i ON i.set_id = p.set_id
         LEFT JOIN practice_outcomes o ON o.lesson_id = p.lesson_id AND o.question_id = i.question_id
        WHERE p.lesson_id = ? ORDER BY p.created_at, i.position`,
      lessonId,
    ),
  ]);

  const groups: { title: string; note: string; items: { question_id: string; outcome: Outcome | null }[] }[] = [
    { title: "In the lesson", note: "Gone through together.", items: lesson.items },
    { title: "Review quiz", note: "The check at the start of the lesson.", items: reviewItems },
    { title: "Extra practice", note: "The extra set on the same ground.", items: practiceItems },
  ];
  const ids = [...new Set(groups.flatMap((g) => g.items.map((i) => i.question_id)))];
  const [byId, written] = await Promise.all([questionsOf(ids), answersOf(lesson.student_id)]);

  const sections = groups
    .map((g) => ({
      title: g.title,
      note: g.note,
      questions: g.items.flatMap((i): ReportQuestion[] => {
        const q = byId.get(i.question_id);
        if (!q) return [];
        const w = written.get(i.question_id);
        return [{ id: i.question_id, label: q.label, marks: q.marks, prompt: q.prompt, outcome: i.outcome, answer: w?.answer ?? null, got: w?.got ?? null }];
      }),
    }))
    .filter((s) => s.questions.length > 0);

  return {
    lessonId,
    title: lesson.title,
    units: unitsOfLesson(lesson.unit),
    taughtAt: lesson.taught_at,
    sentAt: lesson.report_sent_at,
    sections,
  };
}

/** The lesson records this student can read, newest first. */
export async function sentLessonReports(studentId: string) {
  return all<{ id: string; title: string; sent_at: string; taught_at: string | null; questions: number }>(
    `SELECT l.id, l.title, l.report_sent_at AS sent_at, l.taught_at,
            (SELECT COUNT(*)::int FROM lesson_items i WHERE i.lesson_id = l.id) AS questions
       FROM lessons l WHERE l.student_id = ? AND l.report_sent_at IS NOT NULL
      ORDER BY l.report_sent_at DESC`,
    studentId,
  );
}

export async function reportIsSent(lessonId: string, studentId: string): Promise<boolean> {
  const r = await one(
    "SELECT 1 FROM lessons WHERE id = ? AND student_id = ? AND report_sent_at IS NOT NULL",
    lessonId,
    studentId,
  );
  return Boolean(r);
}

export async function setReportSent(lessonId: string, sent: boolean) {
  await run("UPDATE lessons SET report_sent_at = ? WHERE id = ?", sent ? new Date().toISOString() : null, lessonId);
}
