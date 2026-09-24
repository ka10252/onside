"use server";

import { revalidatePath } from "next/cache";
import { all } from "./db";
import { getSchedule, saveSchedule, sendDailySet, type Schedule } from "./schedule";
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
    due_days: dueDays === "" ? null : Number(dueDays),
  };
  await saveSchedule(next);
  revalidatePath(`/tutor/students/${studentId}`);
  return { ok: enabled ? "Saved. The next set goes out on the next practice morning." : "Saved. Daily practice is off." };
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
