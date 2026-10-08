import "server-only";
import { one, run } from "./db";

/**
 * A rewrite: the tutor marks an answer, says what it was missing, and asks for it again. The
 * student writes a second version against that comment, which is the point — a mark alone rarely
 * changes what someone writes next time.
 */
export type Rewrite = {
  note: string;
  askedAt: string;
  text: string | null;
  at: string | null;
  /** When the tutor finished with it. Closed, not deleted: the student's second version stays. */
  doneAt: string | null;
};

export function rewriteOf(r: {
  rewrite_note?: string | null;
  rewrite_asked_at?: string | null;
  rewrite_text?: string | null;
  rewrite_at?: string | null;
  rewrite_done_at?: string | null;
}): Rewrite | null {
  if (!r.rewrite_asked_at) return null;
  return {
    note: r.rewrite_note ?? "",
    askedAt: r.rewrite_asked_at,
    text: r.rewrite_text ?? null,
    at: r.rewrite_at ?? null,
    doneAt: r.rewrite_done_at ?? null,
  };
}

/** Asks for this answer again. Asking a second time clears whatever was written for the first. */
export async function askRewrite(responseId: string, note: string) {
  await run(
    `UPDATE responses SET rewrite_note = ?, rewrite_asked_at = ?, rewrite_text = NULL, rewrite_at = NULL,
            rewrite_done_at = NULL WHERE id = ?`,
    note.slice(0, 1000),
    new Date().toISOString(),
    responseId,
  );
}

/**
 * Takes the request back, for a rewrite the student has not written yet. Once they have written
 * one, there is work to lose, so this closes it instead of deleting it.
 */
export async function cancelRewrite(responseId: string) {
  const r = await one<{ rewrite_text: string | null }>("SELECT rewrite_text FROM responses WHERE id = ?", responseId);
  if (r?.rewrite_text) return closeRewrite(responseId);
  await run(
    `UPDATE responses SET rewrite_note = NULL, rewrite_asked_at = NULL, rewrite_text = NULL, rewrite_at = NULL,
            rewrite_done_at = NULL WHERE id = ?`,
    responseId,
  );
}

/**
 * The tutor is finished with a rewrite they have read. It stops asking to be dealt with and the
 * student keeps what they wrote — deleting it here is what lost a rewrite on 2026-10-08.
 */
export async function closeRewrite(responseId: string) {
  await run("UPDATE responses SET rewrite_done_at = ? WHERE id = ?", new Date().toISOString(), responseId);
}

/** Stores what the student wrote the second time. Only the student who owns the answer may. */
export async function saveRewrite(responseId: string, studentId: string, text: string): Promise<{ error?: string }> {
  const r = await one<{ rewrite_asked_at: string | null }>(
    "SELECT rewrite_asked_at FROM responses WHERE id = ? AND student_id = ?",
    responseId,
    studentId,
  );
  if (!r) return { error: "That answer is not yours." };
  if (!r.rewrite_asked_at) return { error: "No rewrite was asked for on this question." };
  if (!text.trim()) return { error: "Write your answer before sending it." };
  await run("UPDATE responses SET rewrite_text = ?, rewrite_at = ? WHERE id = ?", text.slice(0, 8000), new Date().toISOString(), responseId);
  return {};
}

/** How many rewrites this student still owes, for the badge on their assignments. */
export async function rewritesWaiting(studentId: string): Promise<number> {
  const row = await one<{ n: number }>(
    "SELECT COUNT(*)::int AS n FROM responses WHERE student_id = ? AND rewrite_asked_at IS NOT NULL AND rewrite_text IS NULL",
    studentId,
  );
  return row?.n ?? 0;
}
