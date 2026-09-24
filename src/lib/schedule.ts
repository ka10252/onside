import "server-only";
import { randomBytes } from "node:crypto";
import { bankQuestions, type BankQuestion } from "./admin";
import { pickRandom, sourceOf } from "./bank-filter";
import { all, json, one, run, tx } from "./db";
import { DEFAULT_SCHEDULE, type Schedule } from "./schedule-shared";

export { DAY_NAMES, DEFAULT_SCHEDULE, planPreview } from "./schedule-shared";
export type { Schedule } from "./schedule-shared";

// Daily practice: each morning the cron route sends a student a few questions they haven't seen.
// Vercel's free plan runs a cron once a day, to the hour, so the time lives in vercel.json and the
// tutor chooses the days, how many, and where the questions come from.


/** Today in Singapore, where the tutor and the student are. */
export function singaporeToday(now = new Date()) {
  const sg = new Date(now.getTime() + 8 * 3600_000);
  return { date: sg.toISOString().slice(0, 10), weekday: sg.getUTCDay(), time: sg.toISOString().slice(11, 16) };
}

export async function getSchedule(studentId: string): Promise<Schedule> {
  const row = await one<Schedule>("SELECT * FROM schedules WHERE student_id = ?", studentId);
  return row ?? { student_id: studentId, ...DEFAULT_SCHEDULE };
}

export async function saveSchedule(s: Schedule) {
  await run(
    `INSERT INTO schedules (student_id, enabled, count, source, units, helper, days, send_at, due_days, due_time, plan, plan_index)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (student_id) DO UPDATE SET enabled = excluded.enabled, count = excluded.count, source = excluded.source,
       units = excluded.units, helper = excluded.helper, days = excluded.days, send_at = excluded.send_at,
       due_days = excluded.due_days, due_time = excluded.due_time, plan = excluded.plan, plan_index = excluded.plan_index`,
    s.student_id,
    s.enabled,
    s.count,
    s.source,
    s.units,
    s.helper,
    s.days,
    s.send_at,
    s.due_days,
    s.due_time,
    s.plan,
    s.plan_index,
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

/** The unit the next send covers: the plan's turn, or the unit(s) set for every send. */
export function unitsForNextSend(s: Schedule): number[] {
  const plan = json.parse<number[]>(s.plan, []);
  if (plan.length === 0) return json.parse<number[]>(s.units, []);
  const pick = plan[s.plan_index % plan.length]!;
  return pick === 0 ? [] : [pick];
}

/** The questions the next send would use: random, and spread over the units when there is more than one. */
export async function pickForSchedule(s: Schedule): Promise<BankQuestion[]> {
  const units = unitsForNextSend(s);
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
  const dueDate =
    s.due_days === null ? null : new Date(new Date(`${date}T00:00:00Z`).getTime() + s.due_days * 86_400_000).toISOString().slice(0, 10);
  const due = dueDate && s.due_time ? `${dueDate}T${s.due_time}` : dueDate;
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
    const plan = json.parse<number[]>(s.plan, []);
    await t.run(
      "UPDATE schedules SET last_sent_on = ?, plan_index = ? WHERE student_id = ?",
      date,
      plan.length ? (s.plan_index + 1) % plan.length : 0,
      s.student_id,
    );
  });
  return { sent: questions.length, title };
}

export type RunResult = { student: string; result: string };

/** Sends today's practice to every student whose schedule says so. Safe to call more than once a day. */
export async function runSchedules(now = new Date()): Promise<RunResult[]> {
  const { date, weekday, time } = singaporeToday(now);
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
    if (time < s.send_at) {
      out.push({ student: s.name, result: `waits until ${s.send_at}` });
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
