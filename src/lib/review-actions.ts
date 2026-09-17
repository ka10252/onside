"use server";

import { revalidatePath } from "next/cache";
import { queueMarking } from "./ai/marking";
import type { AiMark } from "./ai/marking";
import { db, json } from "./db";
import { loadReview } from "./review";
import { requireUser } from "./session";

export type ReviewState = { error?: string; ok?: string };

function reviewPath(assignmentId: string) {
  const a = db().prepare("SELECT student_id FROM assignments WHERE id = ?").get(assignmentId) as { student_id: string } | undefined;
  return a ? `/tutor/students/${a.student_id}/a/${assignmentId}` : "/tutor";
}

export async function confirmMark(_prev: ReviewState, fd: FormData): Promise<ReviewState> {
  await requireUser("tutor");
  const responseId = String(fd.get("responseId") ?? "");
  const questionId = String(fd.get("questionId") ?? "");
  const assignmentId = String(fd.get("assignmentId") ?? "");
  const marks = Number(fd.get("marks"));
  const note = String(fd.get("note") ?? "").trim().slice(0, 500);
  const asg = db().prepare("SELECT status, set_id FROM assignments WHERE id = ?").get(assignmentId) as { status: string; set_id: string } | undefined;
  if (!asg) return { error: "Assignment not found." };
  if (asg.status !== "submitted" && asg.status !== "reviewed") return { error: "Marks can be entered after the student submits." };
  const inSet = db().prepare("SELECT 1 FROM set_items WHERE set_id = ? AND question_id = ?").get(asg.set_id, questionId);
  const q = db().prepare("SELECT marks FROM questions WHERE id = ?").get(questionId) as { marks: number } | undefined;
  if (!q || !inSet) return { error: "Question not found." };
  if (!Number.isFinite(marks) || marks < 0 || marks > q.marks || Math.round(marks * 2) !== marks * 2) {
    return { error: `Enter marks from 0 to ${q.marks}.` };
  }
  const mark = JSON.stringify({ marks, note: note || undefined, confirmed_at: new Date().toISOString() });
  if (responseId) {
    db().prepare("UPDATE responses SET tutor_mark = ? WHERE id = ? AND assignment_id = ?").run(mark, responseId, assignmentId);
  } else {
    // question the student never opened: store a 0-response so the mark sticks
    const a = db().prepare("SELECT student_id FROM assignments WHERE id = ?").get(assignmentId) as { student_id: string } | undefined;
    if (!a) return { error: "Assignment not found." };
    db()
      .prepare(
        `INSERT INTO responses (id, assignment_id, student_id, question_id, mode, tutor_mark)
         VALUES (?, ?, ?, ?, 'assigned', ?)
         ON CONFLICT (assignment_id, question_id) DO UPDATE SET tutor_mark = excluded.tutor_mark`,
      )
      .run(`rsp_t${Date.now().toString(36)}`, assignmentId, a.student_id, questionId, mark);
  }
  revalidatePath(reviewPath(assignmentId));
  return { ok: asg.status === "reviewed" ? "Updated. The student sees the new mark." : "Confirmed." };
}

/** Confirms every AI suggestion as it is. */
export async function acceptAiMarks(assignmentId: string) {
  await requireUser("tutor");
  const rows = db()
    .prepare("SELECT id, ai_mark FROM responses WHERE assignment_id = ? AND tutor_mark IS NULL AND ai_mark IS NOT NULL")
    .all(assignmentId) as { id: string; ai_mark: string }[];
  const now = new Date().toISOString();
  for (const r of rows) {
    const m = json.parse<AiMark | null>(r.ai_mark, null);
    if (m?.status !== "done" || m.marks === undefined) continue;
    db()
      .prepare("UPDATE responses SET tutor_mark = ? WHERE id = ?")
      .run(JSON.stringify({ marks: m.marks, note: "Accepted AI suggestion", confirmed_at: now }), r.id);
  }
  revalidatePath(reviewPath(assignmentId));
}

export async function rerunMarking(assignmentId: string) {
  await requireUser("tutor");
  queueMarking(assignmentId, true);
  revalidatePath(reviewPath(assignmentId));
}

export async function markReviewed(assignmentId: string) {
  await requireUser("tutor");
  const rv = loadReview(assignmentId);
  if (!rv || rv.score.pending > 0) return;
  db().prepare("UPDATE assignments SET status = 'reviewed', reviewed_at = ? WHERE id = ?").run(new Date().toISOString(), assignmentId);
  revalidatePath("/tutor", "layout");
  revalidatePath("/student", "layout");
}
