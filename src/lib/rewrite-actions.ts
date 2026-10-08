"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { one } from "./db";
import { send } from "./notify";
import { askRewrite, cancelRewrite, closeRewrite, saveRewrite } from "./rewrite";
import { requireUser } from "./session";

export type RewriteState = { error?: string; ok?: string };

/** The tutor asks for an answer again, saying what to fix. */
export async function requestRewrite(_prev: RewriteState, fd: FormData): Promise<RewriteState> {
  await requireUser("tutor");
  const responseId = String(fd.get("responseId") ?? "");
  const note = String(fd.get("note") ?? "").trim();
  if (!responseId) return { error: "That question has no answer to rewrite." };
  if (!note) return { error: "Say what to fix, or the rewrite has nothing to aim at." };
  const r = await one<{ assignment_id: string; student_id: string }>(
    "SELECT assignment_id, student_id FROM responses WHERE id = ?",
    responseId,
  );
  if (!r) return { error: "That answer is gone." };
  await askRewrite(responseId, note);
  revalidatePath(`/tutor/students/${r.student_id}/a/${r.assignment_id}`);
  return { ok: "Asked for a rewrite." };
}

/** Takes back a rewrite the student has not written yet. */
export async function dropRewrite(responseId: string): Promise<RewriteState> {
  return act(responseId, cancelRewrite);
}

/** The tutor has read the rewrite and is finished with it. What the student wrote stays. */
export async function finishRewrite(responseId: string): Promise<RewriteState> {
  return act(responseId, closeRewrite);
}

async function act(responseId: string, change: (id: string) => Promise<unknown>): Promise<RewriteState> {
  await requireUser("tutor");
  const r = await one<{ assignment_id: string; student_id: string }>(
    "SELECT assignment_id, student_id FROM responses WHERE id = ?",
    responseId,
  );
  if (!r) return { error: "That answer is gone." };
  await change(responseId);
  revalidatePath(`/tutor/students/${r.student_id}/a/${r.assignment_id}`);
  return {};
}

/** The student sends the second version. */
export async function sendRewrite(_prev: RewriteState, fd: FormData): Promise<RewriteState> {
  const user = await requireUser("student");
  const responseId = String(fd.get("responseId") ?? "");
  const text = String(fd.get("text") ?? "");
  const res = await saveRewrite(responseId, user.id, text);
  if (res.error) return res;
  const r = await one<{ assignment_id: string; title: string; name: string }>(
    `SELECT r.assignment_id, s.title, u.name FROM responses r
       JOIN assignments a ON a.id = r.assignment_id JOIN sets s ON s.id = a.set_id JOIN users u ON u.id = r.student_id
      WHERE r.id = ?`,
    responseId,
  );
  if (r) {
    const job = () =>
      send(`<b>${r.name}</b> sent a rewrite\n${r.title}`).catch((e) => console.error("rewrite notice failed", e));
    try {
      after(job);
    } catch {
      void job();
    }
    revalidatePath(`/student/a/${r.assignment_id}/done`);
  }
  return { ok: "Sent to your tutor." };
}
