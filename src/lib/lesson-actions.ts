"use server";

import { revalidatePath } from "next/cache";
import { getLesson, markOutcome, openLesson, reviewPlan, setLessonItems, unfinished, REVIEW_SIZE } from "./lesson";
import { fillTemplate } from "./lesson-template";
import { one, run } from "./db";
import { saveSet } from "./admin-actions";
import { requireUser } from "./session";

export type LessonState = { error?: string; ok?: string };

const back = (studentId: string) => `/tutor/students/${studentId}/lesson`;

export async function startLesson(studentId: string, unit: number, title: string) {
  await requireUser("tutor");
  const l = await openLesson(studentId, unit, title);
  revalidatePath(back(studentId));
  return l.id;
}

export async function pickQuestions(lessonId: string, questionIds: string[]): Promise<LessonState> {
  await requireUser("tutor");
  const l = await getLesson(lessonId);
  if (!l) return { error: "That lesson is gone." };
  if (questionIds.length > 40) return { error: "Forty questions is more than a lesson holds." };
  await setLessonItems(lessonId, questionIds);
  revalidatePath(back(l.student_id));
  return { ok: `${questionIds.length} ${questionIds.length === 1 ? "question" : "questions"} in this lesson.` };
}

export async function setOutcome(lessonId: string, questionId: string, outcome: "right" | "wrong" | null): Promise<LessonState> {
  await requireUser("tutor");
  const l = await getLesson(lessonId);
  if (!l) return { error: "That lesson is gone." };
  await markOutcome(lessonId, questionId, outcome);
  if (l.status === "planning") await run("UPDATE lessons SET status = 'taught', taught_at = ? WHERE id = ?", new Date().toISOString(), lessonId);
  revalidatePath(back(l.student_id));
  return {};
}

export async function saveLessonNotes(lessonId: string, notes: string): Promise<LessonState> {
  await requireUser("tutor");
  const l = await getLesson(lessonId);
  if (!l) return { error: "That lesson is gone." };
  await run("UPDATE lessons SET notes = ? WHERE id = ?", notes.slice(0, 4000), lessonId);
  revalidatePath(back(l.student_id));
  return { ok: "Saved." };
}

/** Sends the review quiz as an ordinary assignment, and remembers which one it was. */
export async function sendReviewQuiz(lessonId: string, due: string | null): Promise<LessonState> {
  await requireUser("tutor");
  const l = await getLesson(lessonId);
  if (!l) return { error: "That lesson is gone." };
  if (l.review_assignment_id) return { error: "The review quiz for this lesson has already gone out." };
  const plan = await reviewPlan(lessonId, REVIEW_SIZE);
  const ids = [...plan.missed, ...plan.variants].map((q) => q.id);
  if (ids.length === 0) return { error: plan.short ?? "Nothing to send." };
  const res = await saveSet(null, {
    title: `Review · Unit ${l.unit} · ${new Date().toLocaleDateString("en-SG", { day: "numeric", month: "short", timeZone: "Asia/Singapore" })}`,
    helper: "off",
    timeLimitMin: null,
    questionIds: ids,
    sendTo: { studentId: l.student_id, due },
  });
  if (res?.error) return { error: res.error };
  const a = await one<{ id: string }>(
    "SELECT id FROM assignments WHERE student_id = ? ORDER BY assigned_at DESC LIMIT 1",
    l.student_id,
  );
  if (a) await run("UPDATE lessons SET review_assignment_id = ? WHERE id = ?", a.id, lessonId);
  revalidatePath(back(l.student_id));
  return { ok: `Sent ${ids.length} questions.` };
}

/** Fills the lesson with the mix this unit's past papers call for. Replaces whatever was picked. */
export async function applyTemplate(lessonId: string): Promise<LessonState> {
  await requireUser("tutor");
  const l = await getLesson(lessonId);
  if (!l) return { error: "That lesson is gone." };
  if (l.unit === null) return { error: "This lesson has no unit." };
  const { recipe, picked, short, spanned } = await fillTemplate(l.unit, l.student_id);
  if (picked.length === 0) return { error: `No unseen questions are left in unit ${l.unit}.` };
  await setLessonItems(lessonId, picked.map((q) => q.id));
  revalidatePath(back(l.student_id));
  const mix = `${recipe.mcq} MCQ · ${recipe.short} short · ${recipe.explain} explain · ${recipe.essay} essay`;
  const both = spanned > 0 ? `, ${spanned} needing both units` : "";
  return { ok: `${picked.length} questions — ${mix}${both}${short ? ` (${short})` : ""}.` };
}

/**
 * Sends what the lesson never got to as homework, with the review quiz added if the tutor wants it.
 * Whether to add it depends on how many are left, which only they can judge.
 */
export async function sendHomework(lessonId: string, withReview: boolean, due: string | null = null): Promise<LessonState> {
  await requireUser("tutor");
  const l = await getLesson(lessonId);
  if (!l) return { error: "That lesson is gone." };
  if (l.homework_assignment_id) return { error: "The homework for this lesson has already gone out." };
  const left = await unfinished(lessonId);
  const extra = withReview ? await reviewPlan(lessonId, REVIEW_SIZE) : null;
  const ids = [...new Set([...left.map((q) => q.id), ...(extra ? [...extra.missed, ...extra.variants].map((q) => q.id) : [])])];
  if (ids.length === 0) return { error: "Nothing is left over from this lesson." };
  const res = await saveSet(null, {
    title: `Homework · Unit ${l.unit} · ${new Date().toLocaleDateString("en-SG", { day: "numeric", month: "short", timeZone: "Asia/Singapore" })}`,
    helper: "off",
    timeLimitMin: null,
    questionIds: ids,
    sendTo: { studentId: l.student_id, due },
  });
  if (res?.error) return { error: res.error };
  const a = await one<{ id: string }>("SELECT id FROM assignments WHERE student_id = ? ORDER BY assigned_at DESC LIMIT 1", l.student_id);
  if (a) {
    await run("UPDATE lessons SET homework_assignment_id = ? WHERE id = ?", a.id, lessonId);
    // The review quiz went out inside the homework, so it is not owed twice.
    if (withReview && !l.review_assignment_id) await run("UPDATE lessons SET review_assignment_id = ? WHERE id = ?", a.id, lessonId);
  }
  revalidatePath(back(l.student_id));
  return { ok: `Sent ${ids.length} questions${withReview ? ", review quiz included" : ""}.` };
}
