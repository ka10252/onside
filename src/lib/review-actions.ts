"use server";

import { revalidatePath } from "next/cache";
import { queueMarking } from "./ai/marking";
import type { AiMark } from "./ai/marking";
import { all, json, one, run } from "./db";
import { loadReview } from "./review";
import { requireUser } from "./session";

export type ReviewState = { error?: string; ok?: string };

async function reviewPath(assignmentId: string) {
  const a = await one<{ student_id: string }>("SELECT student_id FROM assignments WHERE id = ?", assignmentId);
  return a ? `/tutor/students/${a.student_id}/a/${assignmentId}` : "/tutor";
}

export async function confirmMark(_prev: ReviewState, fd: FormData): Promise<ReviewState> {
  await requireUser("tutor");
  const responseId = String(fd.get("responseId") ?? "");
  const questionId = String(fd.get("questionId") ?? "");
  const assignmentId = String(fd.get("assignmentId") ?? "");
  const marks = Number(fd.get("marks"));
  const note = String(fd.get("note") ?? "").trim().slice(0, 500);
  const asg = await one<{ status: string; set_id: string; student_id: string }>(
    "SELECT status, set_id, student_id FROM assignments WHERE id = ?",
    assignmentId,
  );
  if (!asg) return { error: "Assignment not found." };
  if (asg.status !== "submitted" && asg.status !== "reviewed") return { error: "Marks can be entered after the student submits." };
  const inSet = await one("SELECT 1 FROM set_items WHERE set_id = ? AND question_id = ?", asg.set_id, questionId);
  const q = await one<{ marks: number }>("SELECT marks FROM questions WHERE id = ?", questionId);
  if (!q || !inSet) return { error: "Question not found." };
  if (!Number.isFinite(marks) || marks < 0 || marks > q.marks || Math.round(marks * 2) !== marks * 2) {
    return { error: `Enter marks from 0 to ${q.marks}.` };
  }
  const mark = JSON.stringify({ marks, note: note || undefined, confirmed_at: new Date().toISOString() });
  if (responseId) {
    await run("UPDATE responses SET tutor_mark = ? WHERE id = ? AND assignment_id = ?", mark, responseId, assignmentId);
  } else {
    // question the student never opened: store a 0-response so the mark sticks
    await run(
      `INSERT INTO responses (id, assignment_id, student_id, question_id, mode, tutor_mark)
       VALUES (?, ?, ?, ?, 'assigned', ?)
       ON CONFLICT (assignment_id, question_id) DO UPDATE SET tutor_mark = excluded.tutor_mark`,
      `rsp_t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      assignmentId,
      asg.student_id,
      questionId,
      mark,
    );
  }
  revalidatePath(await reviewPath(assignmentId));
  return { ok: asg.status === "reviewed" ? "Updated. The student sees the new mark." : "Confirmed." };
}

/** Confirms every AI suggestion as it is. */
export async function acceptAiMarks(assignmentId: string) {
  await requireUser("tutor");
  const rows = await all<{ id: string; ai_mark: string }>(
    "SELECT id, ai_mark FROM responses WHERE assignment_id = ? AND tutor_mark IS NULL AND ai_mark IS NOT NULL",
    assignmentId,
  );
  const now = new Date().toISOString();
  for (const r of rows) {
    const m = json.parse<AiMark | null>(r.ai_mark, null);
    if (m?.status !== "done" || m.marks === undefined) continue;
    await run(
      "UPDATE responses SET tutor_mark = ? WHERE id = ? AND tutor_mark IS NULL",
      JSON.stringify({ marks: m.marks, note: "Accepted AI suggestion", confirmed_at: now }),
      r.id,
    );
  }
  revalidatePath(await reviewPath(assignmentId));
}

export async function rerunMarking(assignmentId: string) {
  await requireUser("tutor");
  queueMarking(assignmentId, true);
  revalidatePath(await reviewPath(assignmentId));
}

export async function markReviewed(assignmentId: string) {
  await requireUser("tutor");
  const rv = await loadReview(assignmentId);
  if (!rv || rv.score.pending > 0) return;
  await run("UPDATE assignments SET status = 'reviewed', reviewed_at = ? WHERE id = ? AND status = 'submitted'", new Date().toISOString(), assignmentId);
  revalidatePath("/tutor", "layout");
  revalidatePath("/student", "layout");
}
