"use server";

import { revalidatePath } from "next/cache";
import { all } from "./db";
import type { BankQuestion } from "./admin";
import {
  dayIsByHand,
  getSchedule,
  pickForSlot,
  saveSchedule,
  sendDailySet,
  sentTimes,
  singaporeToday,
  slotsForDate,
  type Schedule,
  type Slot,
} from "./schedule";
import { requireUser } from "./session";

export type ScheduleState = { error?: string; ok?: string };

const num = (fd: FormData, key: string) => Number(fd.get(key));

export async function updateSchedule(_prev: ScheduleState, fd: FormData): Promise<ScheduleState> {
  await requireUser("tutor");
  const studentId = String(fd.get("studentId") ?? "");
  const current = await getSchedule(studentId);
  const count = num(fd, "count");
  const source = String(fd.get("source") ?? "test");
  const days = fd.getAll("days").map(Number).filter((d) => d >= 0 && d <= 6);
  const unit = String(fd.get("unit") ?? "");
  const dueDays = String(fd.get("dueDays") ?? "");
  const timesRaw = String(fd.get("times") ?? "[]");
  let times: string[] = [];
  try {
    times = [...new Set((JSON.parse(timesRaw) as unknown[]).map(String))].sort();
  } catch {
    return { error: "The send times could not be read. Try again." };
  }
  if (times.length === 0) times = ["07:00"];
  if (times.length > 6) return { error: "Six sets a day is plenty." };
  const sendAt = times[0]!;
  const dueTime = String(fd.get("dueTime") ?? "");
  const plan = String(fd.get("plan") ?? "[]");
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!times.every((t) => time.test(t))) return { error: "Enter send times like 07:00." };
  if (dueTime && !time.test(dueTime)) return { error: "Enter a due time like 21:00." };
  let planUnits: number[] = [];
  try {
    planUnits = (JSON.parse(plan) as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 20);
  } catch {
    return { error: "The unit plan could not be read. Try again." };
  }
  if (planUnits.length > 30) return { error: "Keep the plan to 30 days or fewer." };
  if (!["test", "past", "mix"].includes(source)) return { error: "Choose where the questions come from." };
  if (!Number.isInteger(count) || count < 1 || count > 20) return { error: "Send between 1 and 20 questions." };
  const enabled = fd.get("enabled") === "on";
  if (enabled && days.length === 0) return { error: "Choose at least one day." };

  const next: Schedule = {
    ...current,
    student_id: studentId,
    enabled: enabled ? 1 : 0,
    count,
    source: source as Schedule["source"],
    units: unit ? JSON.stringify([Number(unit)]) : "[]",
    helper: fd.get("helper") === "off" ? "off" : "on",
    days: JSON.stringify(days.sort()),
    send_at: sendAt,
    times: JSON.stringify(times),
    due_days: dueDays === "" ? null : Number(dueDays),
    due_time: dueTime || null,
    plan: JSON.stringify(planUnits),
    // Keep the plan's place unless the plan itself changed.
    plan_index: plan === current.plan ? current.plan_index : 0,
  };
  await saveSchedule(next);
  revalidatePath(`/tutor/students/${studentId}`);
  return {
    ok: enabled
      ? `Saved. ${times.length === 1 ? `One set at ${sendAt}` : `${times.length} sets a day at ${times.join(", ")}`} on each practice day.`
      : "Saved. Daily practice is off.",
  };
}

/** Sends today's set now, for trying it out. */
export async function sendPracticeNow(_prev: ScheduleState, fd: FormData): Promise<ScheduleState> {
  const tutor = await requireUser("tutor");
  const studentId = String(fd.get("studentId") ?? "");
  const student = await all("SELECT 1 FROM users WHERE id = ? AND role = 'student' AND archived_at IS NULL", studentId);
  if (!student.length) return { error: "That student can't receive sets." };
  const res = await sendDailySet(await getSchedule(studentId), tutor.id);
  revalidatePath(`/tutor/students/${studentId}`);
  revalidatePath("/student", "layout");
  if ("skipped" in res) return { error: `Nothing sent: ${res.skipped}.` };
  return { ok: `Sent ${res.sent} questions: ${res.title}` };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export type DaySlotInput = { unit: number; count: number; time: string };

/** Sets, clears or skips one day on the calendar. A day can hold more than one set. */
export async function setPracticeDay(
  studentId: string,
  date: string,
  choice: "plan" | "skip" | DaySlotInput[],
): Promise<ScheduleState> {
  await requireUser("tutor");
  if (!DATE.test(date)) return { error: "That date doesn't look right." };
  const s = await getSchedule(studentId);
  const overrides = JSON.parse(s.overrides) as Record<string, unknown>;
  if (choice === "plan") {
    delete overrides[date];
  } else if (choice === "skip") {
    overrides[date] = "skip";
  } else {
    if (choice.length === 0) return { error: "Add at least one set, or choose not to send." };
    if (choice.length > 6) return { error: "Six sets in a day is plenty." };
    for (const c of choice) {
      if (!(Number.isInteger(c.unit) && c.unit >= 0 && c.unit <= 20)) return { error: "Choose a unit." };
      if (!(Number.isInteger(c.count) && c.count >= 1 && c.count <= 20)) return { error: "Send between 1 and 20 questions." };
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(c.time)) return { error: "Enter a time like 07:00." };
    }
    if (new Set(choice.map((c) => c.time)).size !== choice.length) return { error: "Two sets can't go out at the same time." };
    overrides[date] = choice.map((c) => ({ u: c.unit, n: c.count, t: c.time }));
  }
  await saveSchedule({ ...s, overrides: JSON.stringify(overrides) });
  revalidatePath(`/tutor/students/${studentId}`);
  if (choice === "plan") return { ok: "Back to the plan for that day." };
  if (choice === "skip") return { ok: "No sets that day." };

  const { date: today, time: now } = singaporeToday();
  const done = sentTimes({ ...s, overrides: JSON.stringify(overrides) }, date);
  const gone = date < today || (date === today && choice.every((c) => now >= c.time || done.includes(c.time)));
  const word = choice.length === 1 ? "set" : "sets";
  return {
    ok: gone
      ? `Saved, but ${date < today ? "that day has passed" : "those times have passed today"}, so it starts from the next day.`
      : `Saved. ${choice.length} ${word}: ${choice.map((c) => `${c.time} · ${c.count}q`).join(", ")}.`,
  };
}

export type DaySet = { time: string; unit: number; count: number; unitLabel: string; sent: boolean; questions: BankQuestion[] };
export type DayPreview = { sets: DaySet[]; byHand: boolean };

/** What that day holds: each set, its questions, and the settings the editor starts from. */
export async function previewPracticeDay(studentId: string, date: string): Promise<DayPreview> {
  await requireUser("tutor");
  const s = await getSchedule(studentId);
  if (!DATE.test(date)) return { sets: [], byHand: false };
  const { slots } = slotsForDate(s, date);
  const done = sentTimes(s, date);
  const sets: DaySet[] = [];
  const taken: string[] = [];
  for (const slot of slots as Slot[]) {
    const questions = await pickForSlot(s, date, slot, taken);
    taken.push(...questions.map((q) => q.id));
    sets.push({
      time: slot.time,
      unit: slot.unit ?? 0,
      count: slot.count,
      unitLabel: slot.unit === null ? "Every unit" : `Unit ${slot.unit}`,
      sent: done.includes(slot.time),
      questions,
    });
  }
  return { sets, byHand: dayIsByHand(s, date) };
}
