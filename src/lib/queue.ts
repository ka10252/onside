import "server-only";
import { randomBytes } from "node:crypto";
import { all, one, run } from "./db";

export type Queued = {
  id: string;
  name: string;
  student_id: string;
  set_id: string;
  send_on: string;
  due_at: string | null;
  sent_at: string | null;
  title: string;
  questions: number;
};

const newId = () => `que_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

const SELECT = `SELECT q.id, q.student_id, q.set_id, q.send_on, q.due_at, q.sent_at, s.title, u.name,
                       (SELECT COUNT(*)::int FROM set_items i WHERE i.set_id = q.set_id) AS questions
                  FROM queued_sets q JOIN sets s ON s.id = q.set_id JOIN users u ON u.id = q.student_id`;

/** Dates a set is already waiting on, so the calendar and the lesson screen can say so. */
export function waitingFor(studentId: string): Promise<Queued[]> {
  return all<Queued>(`${SELECT} WHERE q.student_id = ? AND q.sent_at IS NULL ORDER BY q.send_on`, studentId);
}

export function queuedSet(id: string): Promise<Queued | undefined> {
  return one<Queued>(`${SELECT} WHERE q.id = ?`, id);
}

/** Holds a built set back until a date. The daily run sends it. */
export async function queueSet(studentId: string, setId: string, sendOn: string, dueAt: string | null): Promise<string> {
  const id = newId();
  await run(
    "INSERT INTO queued_sets (id, student_id, set_id, send_on, due_at) VALUES (?, ?, ?, ?, ?)",
    id,
    studentId,
    setId,
    sendOn,
    dueAt,
  );
  return id;
}

export async function unqueue(id: string) {
  await run("DELETE FROM queued_sets WHERE id = ? AND sent_at IS NULL", id);
}

/**
 * Everything dated today or earlier that has not gone out yet. Called by the daily run, so a set
 * dated for a day the run missed still arrives the next morning rather than never.
 */
export async function sendDueQueue(date: string): Promise<{ title: string; student: string }[]> {
  const rows = await all<Queued & { name: string }>(
    `${SELECT}
      WHERE q.sent_at IS NULL AND q.send_on <= ? AND u.archived_at IS NULL
      ORDER BY q.send_on`,
    date,
  );
  const out: { title: string; student: string }[] = [];
  for (const row of rows) {
    // Claim it first: two runs can fire in the same minute.
    const claimed = await run("UPDATE queued_sets SET sent_at = ? WHERE id = ? AND sent_at IS NULL", new Date().toISOString(), row.id);
    if (!claimed) continue;
    await run(
      "INSERT INTO assignments (id, set_id, student_id, due_at) VALUES (?, ?, ?, ?)",
      `asg_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`,
      row.set_id,
      row.student_id,
      row.due_at,
    );
    out.push({ title: row.title, student: row.name });
  }
  return out;
}
