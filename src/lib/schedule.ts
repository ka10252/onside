import "server-only";
import { randomBytes } from "node:crypto";
import { bankQuestions, type BankQuestion } from "./admin";
import { pickRandom, sourceOf } from "./bank-filter";
import { all, json, one, run, tx } from "./db";
import { DEFAULT_SCHEDULE, type Schedule } from "./schedule-shared";

export { DAY_NAMES, DEFAULT_SCHEDULE } from "./schedule-shared";
export type { Schedule } from "./schedule-shared";

// Daily practice: each morning the cron route sends a student a few questions they haven't seen.
// Vercel's free plan runs a cron once a day, to the hour, so the time lives in vercel.json and the
// tutor chooses the days, how many, and where the questions come from.


/** Today in Singapore, where the tutor and the student are. */
export function singaporeToday(now = new Date()) {
  const sg = new Date(now.getTime() + 8 * 3600_000);
  return { date: sg.toISOString().slice(0, 10), weekday: sg.getUTCDay() };
}

export async function getSchedule(studentId: string): Promise<Schedule> {
  const row = await one<Schedule>("SELECT * FROM schedules WHERE student_id = ?", studentId);
  return row ?? { student_id: studentId, ...DEFAULT_SCHEDULE };
}

export async function saveSchedule(s: Schedule) {
  await run(
    `INSERT INTO schedules (student_id, enabled, count, source, units, helper, days, due_days)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (student_id) DO UPDATE SET enabled = excluded.enabled, count = excluded.count, source = excluded.source,
       units = excluded.units, helper = excluded.helper, days = excluded.days, due_days = excluded.due_days`,
    s.student_id,
    s.enabled,
    s.count,
    s.source,
    s.units,
    s.helper,
    s.days,
    s.due_days,
  );
}

/** Questions this student has already been sent. */
async function seenIds(studentId: string): Promise<Set<string>> {
  const rows = await all<{ question_id: string }>(
    `SELECT DISTINCT i.question_id FROM assignments a JOIN set_items i ON i.set_id = a.set_id WHERE a.student_id = ?
      UNION SELECT DISTINCT question_id FROM responses WHERE student_id = ?`,
    studentId,
    studentId,
  );
  return new Set(rows.map((r) => r.question_id));
}

function inSource(q: BankQuestion, source: Schedule["source"]) {
  const s = sourceOf(q);
  if (source === "test") return s === "test";
  if (source === "past") return s === "P1" || s === "P2" || s === "P3";
  return s === "test" || s === "P1" || s === "P2" || s === "P3" || s === "onside";
}

/** The questions a run would send, newest units first is not a thing here: it is random and spread over the chosen units. */
export async function pickForSchedule(s: Schedule): Promise<BankQuestion[]> {
  const units = json.parse<number[]>(s.units, []);
  const [bank, seen] = await Promise.all([bankQuestions(), seenIds(s.student_id)]);
  const pool = bank.filter(
    (q) => !seen.has(q.id) && inSource(q, s.source) && (units.length === 0 || units.includes(q.unit_number)) && q.format !== "essay",
  );
  return pickRandom(pool, Math.max(1, Math.min(20, s.count)), [], units.length > 1) as BankQuestion[];
}

const newId = (prefix: string) => `${prefix}_${randomBytes(6).toString("hex")}`;

/** Builds the set and sends it. Returns what was sent, or why nothing was. */
export async function sendDailySet(s: Schedule, tutorId: string, now = new Date()): Promise<{ sent: number; title: string } | { skipped: string }> {
  const questions = await pickForSchedule(s);
  if (questions.length === 0) return { skipped: "no unseen questions left for these units" };
  const { date } = singaporeToday(now);
  const unitNumbers = [...new Set(questions.map((q) => q.unit_number))].sort((a, b) => a - b);
  const title =
    unitNumbers.length === 1
      ? `Daily practice · Unit ${unitNumbers[0]} · ${new Date(date).toLocaleDateString("en-SG", { day: "numeric", month: "short" })}`
      : `Daily practice · ${new Date(date).toLocaleDateString("en-SG", { day: "numeric", month: "short" })}`;
  const setId = newId("set");
  const due = s.due_days ? new Date(new Date(`${date}T00:00:00Z`).getTime() + s.due_days * 86_400_000).toISOString().slice(0, 10) : null;
  await tx(async (t) => {
    await t.run(
      "INSERT INTO sets (id, title, mode, helper, created_by) VALUES (?, ?, 'assigned', ?, ?)",
      setId,
      title.slice(0, 100),
      s.helper,
      tutorId,
    );
    const values = questions.map(() => "(?, ?, ?)").join(", ");
    await t.run(
      `INSERT INTO set_items (set_id, position, question_id) VALUES ${values}`,
      ...questions.flatMap((q, i) => [setId, i + 1, q.id]),
    );
    await t.run("INSERT INTO assignments (id, set_id, student_id, due_at) VALUES (?, ?, ?, ?)", newId("asg"), setId, s.student_id, due);
    await t.run("UPDATE schedules SET last_sent_on = ? WHERE student_id = ?", date, s.student_id);
  });
  return { sent: questions.length, title };
}

export type RunResult = { student: string; result: string };

/** Sends today's practice to every student whose schedule says so. Safe to call more than once a day. */
export async function runSchedules(now = new Date()): Promise<RunResult[]> {
  const { date, weekday } = singaporeToday(now);
  const tutor = await one<{ id: string }>("SELECT id FROM users WHERE role = 'tutor' ORDER BY id LIMIT 1");
  if (!tutor) return [];
  const rows = await all<Schedule & { name: string; archived_at: string | null }>(
    `SELECT s.*, u.name, u.archived_at FROM schedules s JOIN users u ON u.id = s.student_id
      WHERE s.enabled = 1 AND u.archived_at IS NULL`,
  );
  const out: RunResult[] = [];
  for (const s of rows) {
    if (s.last_sent_on === date) {
      out.push({ student: s.name, result: "already sent today" });
      continue;
    }
    if (!json.parse<number[]>(s.days, []).includes(weekday)) {
      out.push({ student: s.name, result: "not a practice day" });
      continue;
    }
    try {
      const res = await sendDailySet(s, tutor.id, now);
      out.push({ student: s.name, result: "sent" in res ? `sent ${res.sent} questions` : `skipped: ${res.skipped}` });
    } catch (e) {
      console.error("daily practice failed", e);
      out.push({ student: s.name, result: `failed: ${e instanceof Error ? e.message : "unknown"}` });
    }
  }
  return out;
}
