"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { setIsLocked } from "./admin";
import { all, NOW_SQL, one, run, tx, type Queryable } from "./db";
import { deleteFile } from "./storage";
import { checkLogin, hashPassword } from "./password";
import { requireUser } from "./session";

export type FormState = { error?: string; ok?: string };

const newId = (prefix: string) => `${prefix}_${randomBytes(6).toString("hex")}`;
const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

// ---------- students ----------

async function loginTaken(username: string, exceptId: string | null) {
  return Boolean(await one("SELECT 1 FROM users WHERE lower(username) = ? AND id IS DISTINCT FROM ?::text", username, exceptId));
}

export async function createStudent(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireUser("tutor");
  const name = text(fd, "name");
  const subtitle = text(fd, "subtitle");
  const username = text(fd, "username").toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!name) return { error: "Enter a name." };
  if (name.length > 60) return { error: "Name must be 60 characters or fewer." };
  const bad = checkLogin(username, password);
  if (bad) return { error: bad };
  if (await loginTaken(username, null)) return { error: "That login ID is taken." };
  const id = newId("stu");
  await run(
    "INSERT INTO users (id, role, name, subtitle, username, password_hash) VALUES (?, 'student', ?, ?, ?, ?)",
    id,
    name,
    subtitle || null,
    username,
    hashPassword(password),
  );
  revalidatePath("/tutor");
  redirect(`/tutor/students/${id}`);
}

export async function updateStudent(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireUser("tutor");
  const id = text(fd, "id");
  const name = text(fd, "name");
  const subtitle = text(fd, "subtitle");
  const username = text(fd, "username").toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!name) return { error: "Enter a name." };
  if (name.length > 60) return { error: "Name must be 60 characters or fewer." };
  const bad = checkLogin(username, password ? password : null);
  if (bad) return { error: bad };
  if (await loginTaken(username, id)) return { error: "That login ID is taken." };
  const changed = await run("UPDATE users SET name = ?, subtitle = ?, username = ? WHERE id = ? AND role = 'student'", name, subtitle || null, username, id);
  if (changed === 0) return { error: "Student not found." };
  if (password) {
    await tx(async (t) => {
      await t.run("UPDATE users SET password_hash = ? WHERE id = ?", hashPassword(password), id);
      await t.run("DELETE FROM sessions WHERE user_id = ?", id); // sign out everywhere
    });
  }
  revalidatePath("/tutor", "layout");
  return { ok: password ? "Saved. New password is active." : "Saved." };
}

export async function setStudentArchived(fd: FormData) {
  await requireUser("tutor");
  const id = text(fd, "id");
  const archive = text(fd, "archive") === "1";
  await run("UPDATE users SET archived_at = ? WHERE id = ? AND role = 'student'", archive ? new Date().toISOString() : null, id);
  if (archive) await run("DELETE FROM sessions WHERE user_id = ?", id);
  revalidatePath("/tutor", "layout");
}

// ---------- sets ----------

export type SetInput = {
  title: string;
  helper: "on" | "off";
  timeLimitMin: number | null;
  questionIds: string[];
  /** Send the new set straight to this student. */
  sendTo?: { studentId: string; due: string | null } | null;
};

const isPreset = async (setId: string) => Boolean(await one("SELECT 1 FROM sets WHERE id = ? AND preset IS NOT NULL", setId));
const placeholders = (n: number) => Array.from({ length: n }, () => "?").join(", ");
const canReceive = async (studentId: string) =>
  Boolean(await one("SELECT 1 FROM users WHERE id = ? AND role = 'student' AND archived_at IS NULL", studentId));

/** Saving a set is the tutor's approval of the AI drafts in it (call inside the save transaction). */
async function approveDrafts(t: Queryable, ids: string[]) {
  if (!ids.length) return;
  await t.run(
    `UPDATE questions SET approved_by_tutor = 1, data = jsonb_set(data::jsonb, '{approved_by_tutor}', 'true'::jsonb)::text
      WHERE source = 'ai' AND id IN (${placeholders(ids.length)})`,
    ...ids,
  );
}

async function validateSet(input: SetInput, allowDrafts = false): Promise<string | null> {
  if (!input.title.trim()) return "Enter a title.";
  if (input.title.trim().length > 100) return "Title must be 100 characters or fewer.";
  if (input.questionIds.length === 0) return "Add at least one question.";
  if (input.questionIds.length > 200) return "A set can have at most 200 questions.";
  if (new Set(input.questionIds).size !== input.questionIds.length) return "A question is in the set twice.";
  if (input.timeLimitMin !== null && !(Number.isInteger(input.timeLimitMin) && input.timeLimitMin > 0 && input.timeLimitMin <= 300)) {
    return "Time limit must be between 1 and 300 minutes.";
  }
  const found = await one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM questions WHERE (approved_by_tutor = 1 ${allowDrafts ? "OR source = 'ai'" : ""}) AND id IN (${placeholders(input.questionIds.length)})`,
    ...input.questionIds,
  );
  if (found?.n !== input.questionIds.length) return "Some questions are no longer in the bank.";
  return null;
}

async function writeItems(t: Queryable, setId: string, questionIds: string[]) {
  await t.run("DELETE FROM set_items WHERE set_id = ?", setId);
  const values = questionIds.map(() => "(?, ?, ?)").join(", ");
  await t.run(`INSERT INTO set_items (set_id, position, question_id) VALUES ${values}`, ...questionIds.flatMap((q, i) => [setId, i + 1, q]));
}

export async function saveSet(setId: string | null, input: SetInput): Promise<{ error: string } | void> {
  const tutor = await requireUser("tutor");
  if (setId && (await isPreset(setId))) return { error: "Unit tests can't be edited. Use “Send part of this test” instead." };
  if (setId && (await setIsLocked(setId))) return { error: "A student has started this set. It can no longer be edited." };
  if (!["on", "off"].includes(input.helper)) return { error: "Choose Helper on or off." };
  if (input.sendTo && !(await canReceive(input.sendTo.studentId))) return { error: "That student can't receive sets." };
  const error = await validateSet(input, true);
  if (error) return { error };

  const id = setId ?? newId("set");
  const ok = await tx(async (t) => {
    if (setId) {
      const changed = await t.run(
        "UPDATE sets SET title = ?, helper = ?, time_limit_min = ? WHERE id = ? AND mode = 'assigned'",
        input.title.trim(),
        input.helper,
        input.timeLimitMin,
        id,
      );
      if (changed === 0) return false;
    } else {
      await t.run(
        "INSERT INTO sets (id, title, mode, helper, time_limit_min, created_by) VALUES (?, ?, 'assigned', ?, ?, ?)",
        id,
        input.title.trim(),
        input.helper,
        input.timeLimitMin,
        tutor.id,
      );
    }
    await approveDrafts(t, input.questionIds);
    await writeItems(t, id, input.questionIds);
    const to = input.sendTo;
    if (to && !setId) {
      const due = to.due && /^\d{4}-\d{2}-\d{2}$/.test(to.due) ? to.due : null;
      await t.run("INSERT INTO assignments (id, set_id, student_id, due_at) VALUES (?, ?, ?, ?)", newId("asg"), id, to.studentId, due);
    }
    return true;
  });
  if (!ok) return { error: "Set not found." };
  revalidatePath("/tutor", "layout");
  revalidatePath("/student");
  redirect(input.sendTo && !setId ? `/tutor/students/${input.sendTo.studentId}` : `/tutor/sets/${id}`);
}

export async function deleteSet(fd: FormData) {
  await requireUser("tutor");
  const id = text(fd, "id");
  if ((await setIsLocked(id)) || (await isPreset(id))) return;
  await tx(async (t) => {
    await t.run(
      `DELETE FROM events WHERE response_id IN (SELECT r.id FROM responses r JOIN assignments a ON a.id = r.assignment_id
        WHERE a.set_id = ? AND a.status = 'not_started')`,
      id,
    );
    await t.run("DELETE FROM responses WHERE assignment_id IN (SELECT id FROM assignments WHERE set_id = ? AND status = 'not_started')", id);
    await t.run("DELETE FROM assignments WHERE set_id = ? AND status = 'not_started'", id);
    await t.run("DELETE FROM sets WHERE id = ? AND mode = 'assigned'", id);
  });
  revalidatePath("/tutor", "layout");
  redirect("/tutor/sets");
}

// ---------- assignments ----------

export async function assignSet(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireUser("tutor");
  const setId = text(fd, "setId");
  const studentIds = [...new Set(fd.getAll("studentId").map(String).filter(Boolean))];
  const due = text(fd, "due");
  if (!setId) return { error: "Choose a set." };
  if (studentIds.length === 0) return { error: "Choose at least one student." };
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return { error: "Enter a valid due date." };

  const set = await one("SELECT id FROM sets WHERE id = ? AND mode = 'assigned'", setId);
  if (!set) return { error: "Set not found." };

  let sent = 0;
  let skipped = 0;
  await tx(async (t) => {
    for (const sid of studentIds) {
      const student = await t.one("SELECT 1 FROM users WHERE id = ? AND role = 'student' AND archived_at IS NULL", sid);
      const exists = await t.one("SELECT 1 FROM assignments WHERE set_id = ? AND student_id = ?", setId, sid);
      if (!student || exists) {
        skipped++;
        continue;
      }
      await t.run("INSERT INTO assignments (id, set_id, student_id, due_at) VALUES (?, ?, ?, ?)", newId("asg"), setId, sid, due || null);
      sent++;
    }
  });
  revalidatePath("/tutor", "layout");
  revalidatePath("/student");
  if (sent === 0) return { error: "Already sent to the chosen students." };
  return { ok: `Sent to ${sent} ${sent === 1 ? "student" : "students"}${skipped ? ` · ${skipped} already had it` : ""}.` };
}

export async function unassign(fd: FormData) {
  await requireUser("tutor");
  const id = text(fd, "id");
  await tx(async (t) => {
    const a = await t.one("SELECT 1 FROM assignments WHERE id = ? AND status = 'not_started'", id);
    if (!a) return;
    await t.run("DELETE FROM events WHERE response_id IN (SELECT id FROM responses WHERE assignment_id = ?)", id);
    await t.run("DELETE FROM responses WHERE assignment_id = ?", id);
    await t.run("DELETE FROM assignments WHERE id = ? AND status = 'not_started'", id);
  });
  revalidatePath("/tutor", "layout");
  revalidatePath("/student");
}

/** Removes an assignment and everything in it: answers, photos, marks and activity. */
export async function deleteAssignment(fd: FormData) {
  await requireUser("tutor");
  const id = text(fd, "id");
  const a = await one<{ student_id: string }>("SELECT student_id FROM assignments WHERE id = ?", id);
  if (!a) return;
  const photos = await all<{ photo_path: string }>("SELECT photo_path FROM responses WHERE assignment_id = ? AND photo_path IS NOT NULL", id);
  await tx(async (t) => {
    await t.run("UPDATE sets SET review_of = NULL WHERE review_of = ?", id); // a review quiz built from it stays
    await t.run("DELETE FROM events WHERE response_id IN (SELECT id FROM responses WHERE assignment_id = ?)", id);
    await t.run("DELETE FROM responses WHERE assignment_id = ?", id);
    await t.run("DELETE FROM ai_batches WHERE assignment_id = ?", id);
    await t.run("DELETE FROM assignments WHERE id = ?", id);
  });
  for (const p of photos) await deleteFile(p.photo_path).catch(() => {});
  revalidatePath("/tutor", "layout");
  revalidatePath("/student", "layout");
  redirect(`/tutor/students/${a.student_id}`);
}

// ---------- hints ----------

export async function updateHints(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireUser("tutor");
  const id = text(fd, "questionId");
  const h1 = text(fd, "hint1");
  const h2 = text(fd, "hint2");
  if (!h1 || !h2) return { error: "Write both hints." };
  if (h1.length > 400 || h2.length > 400) return { error: "Keep each hint under 400 characters." };
  const found = await tx(async (t) => {
    const changed = await t.run(
      "UPDATE questions SET data = jsonb_set(data::jsonb, '{hints}', jsonb_build_array(?::text, ?::text))::text WHERE id = ?",
      h1,
      h2,
      id,
    );
    if (!changed) return false;
    await t.run(
      `INSERT INTO hint_overrides (question_id, hint1, hint2) VALUES (?, ?, ?)
       ON CONFLICT (question_id) DO UPDATE SET hint1 = excluded.hint1, hint2 = excluded.hint2, updated_at = ${NOW_SQL}`,
      id,
      h1,
      h2,
    );
    return true;
  });
  if (!found) return { error: "Question not found." };
  revalidatePath("/tutor/bank", "layout");
  return { ok: "Hints saved." };
}

// ---------- review quiz ----------

export async function sendReviewQuiz(input: {
  studentId: string;
  fromAssignmentId: string;
  title: string;
  helper: "on" | "off";
  questionIds: string[];
}): Promise<{ error: string } | void> {
  const tutor = await requireUser("tutor");
  if (!(await canReceive(input.studentId))) return { error: "That student can't receive sets." };
  const source = await one(
    "SELECT 1 FROM assignments WHERE id = ? AND student_id = ? AND status = 'reviewed'",
    input.fromAssignmentId,
    input.studentId,
  );
  if (!source) return { error: "Send the marks for this set first." };
  if (!["on", "off"].includes(input.helper)) return { error: "Choose Helper on or off." };
  const ids = [...new Set(input.questionIds)];
  const error = await validateSet({ title: input.title, helper: input.helper, timeLimitMin: null, questionIds: ids }, true);
  if (error) return { error };
  const setId = newId("set");
  await tx(async (t) => {
    await t.run(
      "INSERT INTO sets (id, title, mode, helper, created_by, review_of) VALUES (?, ?, 'assigned', ?, ?, ?)",
      setId,
      input.title.trim(),
      input.helper,
      tutor.id,
      input.fromAssignmentId,
    );
    await approveDrafts(t, ids);
    await writeItems(t, setId, ids);
    await t.run("INSERT INTO assignments (id, set_id, student_id) VALUES (?, ?, ?)", newId("asg"), setId, input.studentId);
  });
  revalidatePath("/tutor", "layout");
  revalidatePath("/student");
  redirect(`/tutor/students/${input.studentId}`);
}
