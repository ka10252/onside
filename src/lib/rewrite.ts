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
};

export function rewriteOf(r: {
  rewrite_note?: string | null;
  rewrite_asked_at?: string | null;
  rewrite_text?: string | null;
  rewrite_at?: string | null;
}): Rewrite | null {
  if (!r.rewrite_asked_at) return null;
  return { note: r.rewrite_note ?? "", askedAt: r.rewrite_asked_at, text: r.rewrite_text ?? null, at: r.rewrite_at ?? null };
}

/** Asks for this answer again. Asking a second time clears whatever was written for the first. */
export async function askRewrite(responseId: string, note: string) {
  await run(
    "UPDATE responses SET rewrite_note = ?, rewrite_asked_at = ?, rewrite_text = NULL, rewrite_at = NULL WHERE id = ?",
    note.slice(0, 1000),
    new Date().toISOString(),
    responseId,
  );
}

export async function cancelRewrite(responseId: string) {
  await run(
    "UPDATE responses SET rewrite_note = NULL, rewrite_asked_at = NULL, rewrite_text = NULL, rewrite_at = NULL WHERE id = ?",
    responseId,
  );
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
