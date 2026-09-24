import "server-only";
import { randomBytes } from "node:crypto";
import { bankQuestions, type BankQuestion } from "./admin";
import { pickRandom, sourceOf } from "./bank-filter";
import { all, json, one, run, tx } from "./db";
import { DEFAULT_SCHEDULE, timesOf, type Schedule } from "./schedule-shared";

export { DAY_NAMES, DEFAULT_SCHEDULE, planPreview, timesOf } from "./schedule-shared";
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
    `INSERT INTO schedules (student_id, enabled, count, source, units, helper, days, send_at, times, due_days, due_time,
                            plan, plan_index, overrides, sent_slots, last_sent_on)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (student_id) DO UPDATE SET enabled = excluded.enabled, count = excluded.count, source = excluded.source,
       units = excluded.units, helper = excluded.helper, days = excluded.days, send_at = excluded.send_at, times = excluded.times,
       due_days = excluded.due_days, due_time = excluded.due_time, plan = excluded.plan, plan_index = excluded.plan_index,
       overrides = excluded.overrides, sent_slots = excluded.sent_slots, last_sent_on = excluded.last_sent_on`,
    s.student_id,
    s.enabled,
    s.count,
    s.source,
    s.units,
    s.helper,
    s.days,
    s.send_at,
    s.times,
    s.due_days,
    s.due_time,
    s.plan,
    s.plan_index,
    s.overrides,
    s.sent_slots,
    s.last_sent_on,
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

/** One set the schedule will send: when, which unit and how many. */
export type Slot = { time: string; unit: number | null; count: number; source: "override" | "plan" };
export type DayPlan = Slot & { date: string };

type StoredSlot = { u: number | null; n?: number | null; t?: string | null };
type StoredChoice = number | "skip" | StoredSlot | StoredSlot[];

const overridesOf = (s: Schedule) => json.parse<Record<string, StoredChoice>>(s.overrides, {});

/** Reads every shape this column has held: a unit number, one set, or several. */
function readChoice(v: StoredChoice | undefined, s: Schedule): "skip" | StoredSlot[] | undefined {
  if (v === undefined) return undefined;
  if (v === "skip") return "skip";
  if (typeof v === "number") return [{ u: v === 0 ? null : v, n: s.count, t: s.send_at }];
  return Array.isArray(v) ? v : [v];
}

/** What the plan says for the nth send (before the days the tutor set by hand). */
function planUnit(s: Schedule, step: number): number | null {
  const plan = json.parse<number[]>(s.plan, []);
  if (plan.length === 0) {
    const fallback = json.parse<number[]>(s.units, []);
    return fallback[0] ?? null;
  }
  const pick = plan[(s.plan_index + step) % plan.length]!;
  return pick === 0 ? null : pick;
}

/** True when the tutor set this day by hand. */
export function dayIsByHand(s: Schedule, date: string) {
  return overridesOf(s)[date] !== undefined;
}

export function daySkipped(s: Schedule, date: string) {
  return overridesOf(s)[date] === "skip";
}

/**
 * Every set that day sends, in time order. `step` is where the rotation stands; it moves on for
 * each set that follows the plan.
 */
export function slotsForDate(s: Schedule, date: string, step = 0): { slots: Slot[]; used: number } {
  const sent = sentTimes(s, date);
  const chosen = readChoice(overridesOf(s)[date], s);
  if (chosen === "skip") return { slots: [], used: 0 };
  if (chosen) {
    const slots = chosen
      .map((c) => ({ time: c.t || s.send_at, unit: c.u === 0 ? null : c.u, count: c.n || s.count, source: "override" as const }))
      .sort((a, b) => a.time.localeCompare(b.time));
    return { slots, used: 0 };
  }
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (!json.parse<number[]>(s.days, []).includes(weekday)) return { slots: [], used: 0 };
  const times = timesOf(s);
  // plan_index has already moved on for the sets that went out today, so only count the ones left.
  let ahead = 0;
  const slots = times.map((time) => {
    const slot = { time, unit: sent.includes(time) ? null : planUnit(s, step + ahead), count: s.count, source: "plan" as const };
    if (!sent.includes(time)) ahead++;
    return slot;
  });
  return { slots, used: ahead };
}

/** Times that already went out on a date. */
export function sentTimes(s: Schedule, date: string): string[] {
  const log = json.parse<Record<string, string[]>>(s.sent_slots, {});
  const times = log[date] ?? [];
  // Before this column existed, one send a day was recorded on the schedule itself.
  return s.last_sent_on === date && times.length === 0 ? [s.send_at] : times;
}

/**
 * A slot is due when its time has come and it hasn't gone out. Changing the time of day after a
 * set has gone out doesn't earn the student another one: a day sends as many sets as it has times.
 */
export function dueSlots(s: Schedule, date: string, nowTime: string): Slot[] {
  const { slots } = slotsForDate(s, date);
  const done = sentTimes(s, date);
  const left = Math.max(0, slots.length - done.length);
  return slots.filter((slot) => nowTime >= slot.time && !done.includes(slot.time)).slice(0, left);
}

/** The unit the next send covers (or the one on a given day). */
export function unitsForNextSend(s: Schedule, date?: string): number[] {
  const slot = date ? slotsForDate(s, date).slots[0] : nextSend(s);
  if (!slot) return [];
  return slot.unit === null ? [] : [slot.unit];
}

/** How many questions that day's first set sends. */
export function countForDay(s: Schedule, date?: string): number {
  const slot = date ? slotsForDate(s, date).slots[0] : nextSend(s);
  return slot?.count ?? s.count;
}

/** When that day's first set goes out. */
export function timeForDay(s: Schedule, date?: string): string {
  const slot = date ? slotsForDate(s, date).slots[0] : nextSend(s);
  return slot?.time ?? s.send_at;
}

/** Same seed, same questions: the tutor's preview shows what will actually be sent. */
function seeded(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/**
 * The questions one set would use: spread over the chosen units, and the same every time for a
 * given student, date and time, so a preview shows what the student will get.
 */
export async function pickForSlot(s: Schedule, date: string, slot: Slot, alsoAvoid: string[] = []): Promise<BankQuestion[]> {
  const units = slot.unit === null ? [] : [slot.unit];
  const [bank, seen] = await Promise.all([bankQuestions(), seenIds(s.student_id)]);
  const pool = bank.filter(
    (q) =>
      !seen.has(q.id) &&
      !alsoAvoid.includes(q.id) &&
      inSource(q, s.source) &&
      (units.length === 0 || units.includes(q.unit_number)) &&
      q.format !== "essay",
  );
  const rand = seeded(`${s.student_id}|${date}|${slot.time}|${units.join(",")}|${slot.count}|${s.source}`);
  // "Every unit" spreads the questions over the units instead of taking them all from one.
  return pickRandom(pool, Math.max(1, Math.min(20, slot.count)), [], units.length !== 1, rand) as BankQuestion[];
}

/** The questions the day's first set would use. */
export async function pickForSchedule(s: Schedule, forDate?: string): Promise<BankQuestion[]> {
  const date = forDate ?? singaporeToday().date;
  const slot = (forDate ? slotsForDate(s, forDate).slots[0] : nextSend(s)) ?? {
    time: s.send_at,
    unit: null,
    count: s.count,
    source: "plan" as const,
  };
  return pickForSlot(s, date, slot);
}

/** When the next set goes out, following the days and the send time. */
export function nextSend(s: Schedule, now = new Date()): DayPlan | null {
  return upcomingSends(s, 60, now)[0] ?? null;
}

const newId = (prefix: string) => `${prefix}_${randomBytes(6).toString("hex")}`;

/**
 * Every send in the next `days` days, with the unit each one covers.
 * Days the tutor set by hand win over the weekly days and the rotation.
 */
export function upcomingSends(s: Schedule, days = 42, now = new Date()): DayPlan[] {
  const { date } = singaporeToday(now);
  const out: DayPlan[] = [];
  let step = 0;
  for (let i = 0; i < days; i++) {
    const iso = new Date(new Date(`${date}T00:00:00Z`).getTime() + i * 86_400_000).toISOString().slice(0, 10);
    const { slots, used } = slotsForDate(s, iso, step);
    step += used;
    const already = i === 0 ? sentTimes(s, iso) : [];
    const stillToCome = i === 0 ? slots.length - already.length : slots.length;
    let shown = 0;
    for (const slot of slots) {
      if (i === 0 && already.includes(slot.time)) continue; // that one went out
      if (i === 0 && shown >= stillToCome) continue; // the day's sets are all accounted for
      shown++;
      out.push({ ...slot, date: iso });
    }
  }
  return out;
}

/** Builds one set and sends it. Returns what was sent, or why nothing was. */
export async function sendSet(
  s: Schedule,
  tutorId: string,
  date: string,
  slot: Slot,
  advancePlan: boolean,
): Promise<{ sent: number; title: string } | { skipped: string }> {
  const questions = await pickForSlot(s, date, slot);
  if (questions.length === 0) return { skipped: "no unseen questions left for these units" };
  const unitNumbers = [...new Set(questions.map((q) => q.unit_number))].sort((a, b) => a - b);
  const shown = new Date(date).toLocaleDateString("en-SG", { day: "numeric", month: "short" });
  const title = unitNumbers.length === 1 ? `Daily practice · Unit ${unitNumbers[0]} · ${shown}` : `Daily practice · ${shown}`;
  const setId = newId("set");
  const dueDate =
    s.due_days === null ? null : new Date(new Date(`${date}T00:00:00Z`).getTime() + s.due_days * 86_400_000).toISOString().slice(0, 10);
  const due = dueDate && s.due_time ? `${dueDate}T${s.due_time}` : dueDate;
  const plan = json.parse<number[]>(s.plan, []);
  let clash = false;
  await tx(async (t) => {
    // Claim the slot first. Two callers (the GitHub workflow and the Vercel cron can fire in the
    // same minute) race here, and only the one that writes the log gets to send.
    const fresh = await t.one<{ sent_slots: string; plan_index: number }>(
      "SELECT sent_slots, plan_index FROM schedules WHERE student_id = ? FOR UPDATE",
      s.student_id,
    );
    // "Send one now" can run before the schedule was ever saved.
    if (!fresh) await t.run("INSERT INTO schedules (student_id) VALUES (?) ON CONFLICT (student_id) DO NOTHING", s.student_id);
    const log = json.parse<Record<string, string[]>>(fresh?.sent_slots ?? s.sent_slots, {});
    if ((log[date] ?? []).includes(slot.time)) {
      clash = true;
      return;
    }
    const times = [...new Set([...(log[date] ?? []), slot.time])].sort();
    // Keep the log to the last few weeks.
    const trimmed = Object.fromEntries(
      Object.entries({ ...log, [date]: times }).filter(([d]) => d >= new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)),
    );
    const index = fresh?.plan_index ?? s.plan_index;
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
    await t.run(
      "UPDATE schedules SET last_sent_on = ?, sent_slots = ?, plan_index = ? WHERE student_id = ?",
      date,
      JSON.stringify(trimmed),
      advancePlan && plan.length ? (index + 1) % plan.length : index,
      s.student_id,
    );
  });
  if (clash) return { skipped: "another run sent this one" };
  return { sent: questions.length, title };
}

/** Sends the next set that is due, for trying it out by hand. */
export async function sendDailySet(s: Schedule, tutorId: string, now = new Date()): Promise<{ sent: number; title: string } | { skipped: string }> {
  const { date } = singaporeToday(now);
  const { slots } = slotsForDate(s, date);
  const done = sentTimes(s, date);
  const slot = slots.find((x) => !done.includes(x.time)) ??
    slots[0] ?? { time: s.send_at, unit: null, count: s.count, source: "plan" as const };
  return sendSet(s, tutorId, date, slot, slot.source === "plan");
}

export type RunResult = { student: string; result: string };

/** Sends today's practice to every student whose schedule says so. Safe to call more than once a day. */
export async function runSchedules(now = new Date()): Promise<RunResult[]> {
  const { date, time } = singaporeToday(now);
  const tutor = await one<{ id: string }>("SELECT id FROM users WHERE role = 'tutor' ORDER BY id LIMIT 1");
  if (!tutor) return [];
  const rows = await all<Schedule & { name: string; archived_at: string | null }>(
    `SELECT s.*, u.name, u.archived_at FROM schedules s JOIN users u ON u.id = s.student_id
      WHERE s.enabled = 1 AND u.archived_at IS NULL`,
  );
  const out: RunResult[] = [];
  for (const row of rows) {
    let s = row;
    const { slots } = slotsForDate(s, date);
    if (slots.length === 0) {
      out.push({ student: s.name, result: daySkipped(s, date) ? "set aside for today" : "not a practice day" });
      continue;
    }
    const due = dueSlots(s, date, time);
    if (due.length === 0) {
      const next = slots.find((slot) => time < slot.time);
      out.push({ student: s.name, result: next ? `waits until ${next.time}` : "already sent today" });
      continue;
    }
    for (const slot of due) {
      try {
        // The schedule is re-read after each send, so the rotation moves on one step at a time.
        const res = await sendSet(s, tutor.id, date, slot, slot.source === "plan");
        out.push({ student: s.name, result: "sent" in res ? `${slot.time}: sent ${res.sent} questions` : `${slot.time}: ${res.skipped}` });
        // The next set in the same run needs the updated log and rotation.
        s = { ...s, ...(await getSchedule(s.student_id)), name: s.name, archived_at: s.archived_at };
      } catch (e) {
        console.error("daily practice failed", e);
        out.push({ student: s.name, result: `failed: ${e instanceof Error ? e.message : "unknown"}` });
      }
    }
  }
  return out;
}

