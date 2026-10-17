"use server";


import { revalidatePath } from "next/cache";
import {
  assignNow,
  buildSet,
  getLesson,
  markOutcome,
  newId,
  openLesson,
  practicePlan,
  practiceSets,
  reviewPlan,
  setLessonItems,
  unfinished,
  REVIEW_SIZE,
} from "./lesson";
import { REVIEW_KINDS, reviewKindOf, type ReviewKind } from "./question-types";
import { fillTemplate } from "./lesson-template";
import { one, run, tx } from "./db";
import { queueSet } from "./queue";
import { unitsOfLesson } from "./lesson-plan";
import { releaseNotes, unreleaseNotes } from "./revision";
import { singaporeToday } from "./schedule";
import { requireUser } from "./session";

export type LessonState = { error?: string; ok?: string; setId?: string };

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
  if (l.status === "planning") {
    await run("UPDATE lessons SET status = 'taught', taught_at = ? WHERE id = ?", new Date().toISOString(), lessonId);
    // A lesson covers one unit or two, and teaching it opens the notes for all of them.
    await releaseNotes(l.student_id, unitsOfLesson(l.unit));
  }
  revalidatePath(back(l.student_id));
  return {};
}

/** How a review-quiz question went, run on the shared screen at the start of the next lesson. */
export async function setReviewOutcome(
  lessonId: string,
  questionId: string,
  outcome: "right" | "wrong" | null,
): Promise<LessonState> {
  await requireUser("tutor");
  const l = await getLesson(lessonId);
  if (!l) return { error: "That lesson is gone." };
  if (outcome === null) {
    await run("DELETE FROM review_outcomes WHERE lesson_id = ? AND question_id = ?", lessonId, questionId);
  } else {
    await run(
      `INSERT INTO review_outcomes (lesson_id, question_id, outcome, at) VALUES (?, ?, ?, ?)
         ON CONFLICT (lesson_id, question_id) DO UPDATE SET outcome = excluded.outcome, at = excluded.at`,
      lessonId,
      questionId,
      outcome,
      new Date().toISOString(),
    );
  }
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

/**
 * Builds the review quiz and stops. The tutor looks at it the way the student will, and sends it
 * when they are happy with it: a quiz built from what went wrong is worth a second pair of eyes.
 */
export async function buildReviewQuiz(lessonId: string, size = REVIEW_SIZE, kinds?: ReviewKind[]): Promise<LessonState> {
  await requireUser("tutor");
  const l = await getLesson(lessonId);
  if (!l) return { error: "That lesson is gone." };
  if (l.review_assignment_id) return { error: "The review quiz for this lesson has already gone out." };
  const plan = await reviewPlan(lessonId, size, kinds?.length ? kinds : undefined);
  // The quiz runs in the order a paper asks: multiple choice first, then definitions, and so on,
  // whether a question is there because it went wrong or because it is on the same ground.
  const asked = kinds?.length ? kinds : REVIEW_KINDS;
  const ids = [...plan.sameIdea, ...plan.others]
    .sort((a, b) => asked.indexOf(reviewKindOf(a)!) - asked.indexOf(reviewKindOf(b)!))
    .map((q) => q.id);
  if (ids.length === 0) return { error: plan.short ?? "Nothing to build." };
  const tutor = await requireUser("tutor");
  const setId = await buildSet({
    title: `Review · Unit ${l.unit} · ${new Date().toLocaleDateString("en-SG", { day: "numeric", month: "short", timeZone: "Asia/Singapore" })}`,
    helper: "off",
    questionIds: ids,
    createdBy: tutor.id,
  });
  await run("UPDATE lessons SET review_set_id = ? WHERE id = ?", setId, lessonId);
  revalidatePath(back(l.student_id));
  return { ok: `${ids.length} questions built. Look at it before you send it.`, setId };
}

/** Sends the quiz that was built, now or on a day the tutor chooses. */
export async function sendReviewQuiz(lessonId: string, due: string | null, sendOn: string | null = null): Promise<LessonState> {
  await requireUser("tutor");
  const l = await getLesson(lessonId);
  if (!l) return { error: "That lesson is gone." };
  if (l.review_assignment_id) return { error: "The review quiz for this lesson has already gone out." };
  if (!l.review_set_id) return { error: "Build the quiz first." };
  const later = sendOn && sendOn > singaporeToday().date ? sendOn : null;
  if (later) {
    await queueSet(l.student_id, l.review_set_id, later, due);
    await run("UPDATE lessons SET review_assignment_id = ? WHERE id = ?", `queued:${l.review_set_id}`, lessonId);
    revalidatePath(back(l.student_id));
    const when = new Date(`${later}T00:00:00Z`).toLocaleDateString("en-SG", { day: "numeric", month: "short", timeZone: "UTC" });
    return { ok: `Waiting until ${when}.` };
  }
  const assignmentId = await assignNow(l.review_set_id, l.student_id, due);
  await run("UPDATE lessons SET review_assignment_id = ? WHERE id = ?", assignmentId, lessonId);
  revalidatePath(back(l.student_id));
  return { ok: "Sent." };
}

/** Throws away a built quiz so it can be built again from what is marked now. */
export async function dropReviewQuiz(lessonId: string): Promise<LessonState> {
  await requireUser("tutor");
  const l = await getLesson(lessonId);
  if (!l) return { error: "That lesson is gone." };
  if (l.review_assignment_id) return { error: "It has already gone out." };
  await run("UPDATE lessons SET review_set_id = NULL WHERE id = ?", lessonId);
  revalidatePath(back(l.student_id));
  return { ok: "Dropped. Build it again when you are ready." };
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
  const mix = `${recipe.mcq} MCQ · ${recipe.definition} definition · ${recipe.short} short · ${recipe.diagram} diagram · ${recipe.essay} essay set`;
  const both = spanned > 0 ? `, ${spanned} needing both units` : "";
  return { ok: `${picked.length} questions — ${mix}${both}${short ? ` (${short})` : ""}.` };
}

/** A homework set worth setting: fewer than this and it is not worth a trip to the app. */
const MIN_HOMEWORK = 5;

/**
 * Builds the homework and stops, so the tutor can look at it the way the student will before it
 * goes anywhere. Whatever was chosen from the questions the lesson never reached, topped up to five
 * with questions on the same ground as the ones that went wrong.
 */
export async function buildHomework(lessonId: string, only: string[] = []): Promise<LessonState> {
  const tutor = await requireUser("tutor");
  const l = await getLesson(lessonId);
  if (!l) return { error: "That lesson is gone." };
  if (l.homework_assignment_id) return { error: "The homework for this lesson has already gone out." };
  const all = await unfinished(lessonId);
  const left = only.length ? all.filter((q) => only.includes(q.id)) : all;
  if (left.length === 0) return { error: "No questions chosen." };

  const ids = left.map((q) => q.id);
  let added = 0;
  if (ids.length < MIN_HOMEWORK) {
    // Short of five: fill up with questions on the same ground as the ones that went wrong.
    const plan = await reviewPlan(lessonId, MIN_HOMEWORK + ids.length);
    for (const q of [...plan.sameIdea, ...plan.others]) {
      if (ids.length >= MIN_HOMEWORK) break;
      if (ids.includes(q.id)) continue;
      ids.push(q.id);
      added++;
    }
  }

  const setId = await buildSet({
    title: `Homework · Unit ${l.unit} · ${new Date().toLocaleDateString("en-SG", { day: "numeric", month: "short", timeZone: "Asia/Singapore" })}`,
    // Work done at home is work done alone: the hints and the helper are there, as in daily
    // practice, and the marking screen separates what was answered with help from what was not.
    helper: "on",
    questionIds: ids,
    createdBy: tutor.id,
  });
  await run("UPDATE lessons SET homework_set_id = ? WHERE id = ?", setId, lessonId);
  revalidatePath(back(l.student_id));
  const topped = added > 0 ? `, ${added} on the same ground as what went wrong` : "";
  return { ok: `${ids.length} questions built${topped}. Look at it before you send it.`, setId };
}

/** Sends the homework that was built, now or on a day the tutor chooses. */
export async function sendHomework(lessonId: string, due: string | null = null, sendOn: string | null = null): Promise<LessonState> {
  await requireUser("tutor");
  const l = await getLesson(lessonId);
  if (!l) return { error: "That lesson is gone." };
  if (l.homework_assignment_id) return { error: "The homework for this lesson has already gone out." };
  if (!l.homework_set_id) return { error: "Build the homework first." };
  const later = sendOn && sendOn > singaporeToday().date ? sendOn : null;
  if (later) {
    await queueSet(l.student_id, l.homework_set_id, later, due);
    await run("UPDATE lessons SET homework_assignment_id = ? WHERE id = ?", `queued:${l.homework_set_id}`, lessonId);
    revalidatePath(back(l.student_id));
    const when = new Date(`${later}T00:00:00Z`).toLocaleDateString("en-SG", { day: "numeric", month: "short", timeZone: "UTC" });
    return { ok: `Waiting until ${when}.` };
  }
  const assignmentId = await assignNow(l.homework_set_id, l.student_id, due);
  await run("UPDATE lessons SET homework_assignment_id = ? WHERE id = ?", assignmentId, lessonId);
  revalidatePath(back(l.student_id));
  return { ok: "Sent." };
}

/** Throws away built homework so it can be built again from a different choice. */
export async function dropHomework(lessonId: string): Promise<LessonState> {
  await requireUser("tutor");
  const l = await getLesson(lessonId);
  if (!l) return { error: "That lesson is gone." };
  if (l.homework_assignment_id) return { error: "It has already gone out." };
  await run("UPDATE lessons SET homework_set_id = NULL WHERE id = ?", lessonId);
  revalidatePath(back(l.student_id));
  return { ok: "Dropped. Choose again and build it." };
}

/** Sends the revision notes for these units: the whole lesson's, or one unit on its own. */
export async function sendNotes(studentId: string, units: number[]): Promise<LessonState> {
  await requireUser("tutor");
  if (units.length === 0) return { error: "No units chosen." };
  await releaseNotes(studentId, units);
  revalidatePath(back(studentId));
  revalidatePath("/tutor/teach");
  revalidatePath("/student", "layout");
  return { ok: `Unit ${units.join(" and ")} ${units.length === 1 ? "notes are" : "notes are"} open to them now.` };
}

/** Takes one unit's notes back. */
export async function unsendNotes(studentId: string, unit: number): Promise<LessonState> {
  await requireUser("tutor");
  await unreleaseNotes(studentId, unit);
  revalidatePath(back(studentId));
  revalidatePath("/tutor/teach");
  revalidatePath("/student", "layout");
  return { ok: `Unit ${unit} notes are closed again.` };
}

/**
 * Extra practice on a lesson's ground. A lesson can have as many as the bank allows: each one is
 * drawn from what the lesson, its quiz, its homework and the earlier practice sets have left, so
 * the student never meets the same question twice (Jin, 2026-10-18).
 */
export async function buildPractice(lessonId: string, size: number, kinds: ReviewKind[]): Promise<LessonState> {
  const tutor = await requireUser("tutor");
  const l = await getLesson(lessonId);
  if (!l) return { error: "That lesson is gone." };
  const plan = await practicePlan(lessonId, size, kinds.length ? kinds : REVIEW_KINDS);
  if (plan.picked.length === 0) {
    return { error: plan.short ? `Nothing left: ${plan.short}.` : "No unseen questions are left for these units." };
  }
  const asked = kinds.length ? kinds : REVIEW_KINDS;
  const ids = plan.picked
    .sort((a, b) => asked.indexOf(reviewKindOf(a)!) - asked.indexOf(reviewKindOf(b)!))
    .map((q) => q.id);
  const n = (await practiceSets(lessonId)).length + 1;
  const setId = await buildSet({
    title: `Practice ${n} · Unit ${l.unit} · ${new Date().toLocaleDateString("en-SG", { day: "numeric", month: "short", timeZone: "Asia/Singapore" })}`,
    // Done at home, so the hints and the Helper are there, as in daily practice.
    helper: "on",
    questionIds: ids,
    createdBy: tutor.id,
  });
  await run("INSERT INTO practice_sets (id, lesson_id, set_id) VALUES (?, ?, ?)", newId("prc"), lessonId, setId);
  revalidatePath(back(l.student_id));
  return { ok: `${ids.length} questions built.${plan.short ? ` ${plan.short}.` : ""} Look at it before you send it.`, setId };
}

export async function sendPractice(practiceId: string, due: string | null, sendOn: string | null = null): Promise<LessonState> {
  await requireUser("tutor");
  const p = await one<{ set_id: string; assignment_id: string | null; student_id: string }>(
    `SELECT p.set_id, p.assignment_id, l.student_id FROM practice_sets p JOIN lessons l ON l.id = p.lesson_id WHERE p.id = ?`,
    practiceId,
  );
  if (!p) return { error: "That practice set is gone." };
  if (p.assignment_id) return { error: "That practice set has already gone out." };
  const later = sendOn && sendOn > singaporeToday().date ? sendOn : null;
  if (later) {
    await queueSet(p.student_id, p.set_id, later, due);
    await run("UPDATE practice_sets SET assignment_id = ? WHERE id = ?", `queued:${p.set_id}`, practiceId);
    revalidatePath(back(p.student_id));
    const when = new Date(`${later}T00:00:00Z`).toLocaleDateString("en-SG", { day: "numeric", month: "short", timeZone: "UTC" });
    return { ok: `Waiting until ${when}.` };
  }
  const assignmentId = await assignNow(p.set_id, p.student_id, due);
  await run("UPDATE practice_sets SET assignment_id = ? WHERE id = ?", assignmentId, practiceId);
  revalidatePath(back(p.student_id));
  return { ok: "Sent." };
}

/** Throws away a practice set that has not gone out, freeing its questions for the next one. */
export async function dropPractice(practiceId: string): Promise<LessonState> {
  await requireUser("tutor");
  const p = await one<{ set_id: string; assignment_id: string | null; student_id: string }>(
    `SELECT p.set_id, p.assignment_id, l.student_id FROM practice_sets p JOIN lessons l ON l.id = p.lesson_id WHERE p.id = ?`,
    practiceId,
  );
  if (!p) return { error: "That practice set is gone." };
  if (p.assignment_id) return { error: "It has gone out already, so it cannot be thrown away." };
  await tx(async (t) => {
    await t.run("DELETE FROM practice_sets WHERE id = ?", practiceId);
    await t.run("DELETE FROM set_items WHERE set_id = ?", p.set_id);
    await t.run("DELETE FROM sets WHERE id = ?", p.set_id);
  });
  revalidatePath(back(p.student_id));
  return {};
}
