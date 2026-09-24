"use server";

import { revalidatePath } from "next/cache";
import { all } from "./db";
import type { BankQuestion } from "./admin";
import { getSchedule, pickForSchedule, saveSchedule, sendDailySet, unitsForNextSend, type Schedule } from "./schedule";
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
  const sendAt = String(fd.get("sendAt") ?? "07:00");
  const dueTime = String(fd.get("dueTime") ?? "");
  const plan = String(fd.get("plan") ?? "[]");
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!time.test(sendAt)) return { error: "Enter a send time like 07:00." };
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
    due_days: dueDays === "" ? null : Number(dueDays),
    due_time: dueTime || null,
    plan: JSON.stringify(planUnits),
    // Keep the plan's place unless the plan itself changed.
    plan_index: plan === current.plan ? current.plan_index : 0,
  };
  await saveSchedule(next);
  revalidatePath(`/tutor/students/${studentId}`);
  return { ok: enabled ? `Saved. The next set goes out at ${sendAt} on the next practice day.` : "Saved. Daily practice is off." };
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

/** Sets, clears or skips one day on the calendar. */
export async function setPracticeDay(studentId: string, date: string, choice: "plan" | "skip" | number): Promise<ScheduleState> {
  await requireUser("tutor");
  if (!DATE.test(date)) return { error: "That date doesn't look right." };
  if (typeof choice === "number" && !(Number.isInteger(choice) && choice >= 0 && choice <= 20)) return { error: "Choose a unit." };
  const s = await getSchedule(studentId);
  const overrides = JSON.parse(s.overrides) as Record<string, number | "skip">;
  if (choice === "plan") delete overrides[date];
  else overrides[date] = choice;
  await saveSchedule({ ...s, overrides: JSON.stringify(overrides) });
  revalidatePath(`/tutor/students/${studentId}`);
  return { ok: choice === "plan" ? "Back to the plan for that day." : choice === "skip" ? "No set that day." : "Saved." };
}

export type DayPreview = { unitLabel: string; questions: BankQuestion[] };

/** The questions that day would send, so the tutor can look before it goes out. */
export async function previewPracticeDay(studentId: string, date: string): Promise<DayPreview> {
  await requireUser("tutor");
  const s = await getSchedule(studentId);
  if (!DATE.test(date)) return { unitLabel: "", questions: [] };
  const units = unitsForNextSend(s, date);
  return {
    unitLabel: units.length === 0 ? "Every unit" : `Unit ${units[0]}`,
    questions: await pickForSchedule(s, date),
  };
}
