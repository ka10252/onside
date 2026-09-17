"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { setIsLocked } from "./admin";
import { db } from "./db";
import { checkLogin, hashPassword } from "./password";
import { requireUser } from "./session";

export type FormState = { error?: string; ok?: string };

const newId = (prefix: string) => `${prefix}_${randomBytes(6).toString("hex")}`;
const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

// ---------- students ----------

function loginTaken(username: string, exceptId: string | null) {
  return Boolean(
    db()
      .prepare("SELECT 1 FROM users WHERE username = ? COLLATE NOCASE AND id IS NOT ?")
      .get(username, exceptId),
  );
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
  if (loginTaken(username, null)) return { error: "That login ID is taken." };
  const id = newId("stu");
  db()
    .prepare("INSERT INTO users (id, role, name, subtitle, username, password_hash) VALUES (?, 'student', ?, ?, ?, ?)")
    .run(id, name, subtitle || null, username, hashPassword(password));
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
  if (loginTaken(username, id)) return { error: "That login ID is taken." };
  const res = db()
    .prepare("UPDATE users SET name = ?, subtitle = ?, username = ? WHERE id = ? AND role = 'student'")
    .run(name, subtitle || null, username, id);
  if (res.changes === 0) return { error: "Student not found." };
  if (password) {
    db().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(password), id);
    db().prepare("DELETE FROM sessions WHERE user_id = ?").run(id); // sign out everywhere
  }
  revalidatePath("/tutor", "layout");
  return { ok: password ? "Saved. New password is active." : "Saved." };
}

export async function setStudentArchived(fd: FormData) {
  await requireUser("tutor");
  const id = text(fd, "id");
  const archive = text(fd, "archive") === "1";
  db()
    .prepare("UPDATE users SET archived_at = ? WHERE id = ? AND role = 'student'")
    .run(archive ? new Date().toISOString() : null, id);
  if (archive) db().prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
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

const isPreset = (setId: string) => Boolean(db().prepare("SELECT 1 FROM sets WHERE id = ? AND preset IS NOT NULL").get(setId));

/** Saving a set is the tutor's approval of the AI drafts in it (call inside the save transaction). */
function approveDrafts(ids: string[]) {
  if (!ids.length) return;
  const ph = ids.map(() => "?").join(", ");
  db()
    .prepare(`UPDATE questions SET approved_by_tutor = 1, data = json_set(data, '$.approved_by_tutor', json('true')) WHERE source = 'ai' AND id IN (${ph})`)
    .run(...ids);
}

function validateSet(input: SetInput, allowDrafts = false): string | null {
  if (!input.title.trim()) return "Enter a title.";
  if (input.title.trim().length > 100) return "Title must be 100 characters or fewer.";
  if (input.questionIds.length === 0) return "Add at least one question.";
  if (new Set(input.questionIds).size !== input.questionIds.length) return "A question is in the set twice.";
  if (input.timeLimitMin !== null && !(Number.isInteger(input.timeLimitMin) && input.timeLimitMin > 0 && input.timeLimitMin <= 300)) {
    return "Time limit must be between 1 and 300 minutes.";
  }
  const placeholders = input.questionIds.map(() => "?").join(", ");
  const found = db()
    .prepare(`SELECT COUNT(*) AS n FROM questions WHERE (approved_by_tutor = 1 ${allowDrafts ? "OR source = 'ai'" : ""}) AND id IN (${placeholders})`)
    .get(...input.questionIds) as { n: number };
  if (found.n !== input.questionIds.length) return "Some questions are no longer in the bank.";
  return null;
}

function writeItems(setId: string, questionIds: string[]) {
  db().prepare("DELETE FROM set_items WHERE set_id = ?").run(setId);
  const insert = db().prepare("INSERT INTO set_items (set_id, position, question_id) VALUES (?, ?, ?)");
  questionIds.forEach((q, i) => insert.run(setId, i + 1, q));
}

export async function saveSet(setId: string | null, input: SetInput): Promise<{ error: string } | void> {
  const tutor = await requireUser("tutor");
  if (setId && isPreset(setId)) return { error: "Unit tests can't be edited. Use “Send part of this test” instead." };
  if (setId && setIsLocked(setId)) return { error: "A student has started this set. It can no longer be edited." };
  if (!["on", "off"].includes(input.helper)) return { error: "Choose Helper on or off." };
  if (input.sendTo) {
    const ok = db().prepare("SELECT 1 FROM users WHERE id = ? AND role = 'student' AND archived_at IS NULL").get(input.sendTo.studentId);
    if (!ok) return { error: "That student can't receive sets." };
  }
  const error = validateSet(input, true);
  if (error) return { error };

  const id = setId ?? newId("set");
  db().transaction(() => {
    approveDrafts(input.questionIds);
    if (setId) {
      const res = db()
        .prepare("UPDATE sets SET title = ?, helper = ?, time_limit_min = ? WHERE id = ? AND mode = 'assigned'")
        .run(input.title.trim(), input.helper, input.timeLimitMin, id);
      if (res.changes === 0) throw new Error("Set not found"); // rolls back; only reachable via a hand-made request
    } else {
      db()
        .prepare("INSERT INTO sets (id, title, mode, helper, time_limit_min, created_by) VALUES (?, ?, 'assigned', ?, ?, ?)")
        .run(id, input.title.trim(), input.helper, input.timeLimitMin, tutor.id);
    }
    writeItems(id, input.questionIds);
    const to = input.sendTo;
    if (to && !setId) {
      const due = to.due && /^\d{4}-\d{2}-\d{2}$/.test(to.due) ? to.due : null;
      db().prepare("INSERT INTO assignments (id, set_id, student_id, due_at) VALUES (?, ?, ?, ?)").run(newId("asg"), id, to.studentId, due);
    }
  })();
  revalidatePath("/tutor", "layout");
  revalidatePath("/student");
  redirect(input.sendTo && !setId ? `/tutor/students/${input.sendTo.studentId}` : `/tutor/sets/${id}`);
}

export async function deleteSet(fd: FormData) {
  await requireUser("tutor");
  const id = text(fd, "id");
  if (setIsLocked(id) || isPreset(id)) return;
  db().transaction(() => {
    db()
      .prepare("DELETE FROM responses WHERE assignment_id IN (SELECT id FROM assignments WHERE set_id = ? AND status = 'not_started')")
      .run(id);
    db().prepare("DELETE FROM assignments WHERE set_id = ? AND status = 'not_started'").run(id);
    db().prepare("DELETE FROM sets WHERE id = ? AND mode = 'assigned'").run(id);
  })();
  revalidatePath("/tutor", "layout");
  redirect("/tutor/sets");
}

// ---------- assignments ----------

export async function assignSet(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireUser("tutor");
  const setId = text(fd, "setId");
  const studentIds = fd.getAll("studentId").map(String).filter(Boolean);
  const due = text(fd, "due");
  if (!setId) return { error: "Choose a set." };
  if (studentIds.length === 0) return { error: "Choose at least one student." };
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return { error: "Enter a valid due date." };

  const set = db().prepare("SELECT id FROM sets WHERE id = ? AND mode = 'assigned'").get(setId);
  if (!set) return { error: "Set not found." };

  const exists = db().prepare("SELECT 1 FROM assignments WHERE set_id = ? AND student_id = ?");
  const student = db().prepare("SELECT 1 FROM users WHERE id = ? AND role = 'student' AND archived_at IS NULL");
  const insert = db().prepare("INSERT INTO assignments (id, set_id, student_id, due_at) VALUES (?, ?, ?, ?)");
  let sent = 0;
  let skipped = 0;
  db().transaction(() => {
    for (const sid of studentIds) {
      if (!student.get(sid) || exists.get(setId, sid)) {
        skipped++;
        continue;
      }
      insert.run(newId("asg"), setId, sid, due || null);
      sent++;
    }
  })();
  revalidatePath("/tutor", "layout");
  revalidatePath("/student");
  if (sent === 0) return { error: "Already sent to the chosen students." };
  return { ok: `Sent to ${sent} ${sent === 1 ? "student" : "students"}${skipped ? ` · ${skipped} already had it` : ""}.` };
}

export async function unassign(fd: FormData) {
  await requireUser("tutor");
  const id = text(fd, "id");
  db().transaction(() => {
    db().prepare("DELETE FROM responses WHERE assignment_id = ? AND EXISTS (SELECT 1 FROM assignments WHERE id = ? AND status = 'not_started')").run(id, id);
    db().prepare("DELETE FROM assignments WHERE id = ? AND status = 'not_started'").run(id);
  })();
  revalidatePath("/tutor", "layout");
  revalidatePath("/student");
}

// ---------- hints ----------

export async function updateHints(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireUser("tutor");
  const id = text(fd, "questionId");
  const h1 = text(fd, "hint1");
  const h2 = text(fd, "hint2");
  if (!h1 || !h2) return { error: "Write both hints." };
  if (h1.length > 400 || h2.length > 400) return { error: "Keep each hint under 400 characters." };
  const res = db()
    .prepare("UPDATE questions SET data = json_set(data, '$.hints', json_array(?, ?)) WHERE id = ?")
    .run(h1, h2, id);
  if (res.changes === 0) return { error: "Question not found." };
  db()
    .prepare(
      `INSERT INTO hint_overrides (question_id, hint1, hint2) VALUES (?, ?, ?)
       ON CONFLICT(question_id) DO UPDATE SET hint1 = excluded.hint1, hint2 = excluded.hint2,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    )
    .run(id, h1, h2);
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
  const student = db().prepare("SELECT id FROM users WHERE id = ? AND role = 'student' AND archived_at IS NULL").get(input.studentId);
  if (!student) return { error: "That student can't receive sets." };
  const source = db()
    .prepare("SELECT 1 FROM assignments WHERE id = ? AND student_id = ? AND status = 'reviewed'")
    .get(input.fromAssignmentId, input.studentId);
  if (!source) return { error: "Send the marks for this set first." };
  const ids = [...new Set(input.questionIds)];
  const error = validateSet({ title: input.title, helper: input.helper, timeLimitMin: null, questionIds: ids }, true);
  if (error) return { error };
  const setId = newId("set");
  db().transaction(() => {
    approveDrafts(ids);
    db()
      .prepare("INSERT INTO sets (id, title, mode, helper, created_by, review_of) VALUES (?, ?, 'assigned', ?, ?, ?)")
      .run(setId, input.title.trim(), input.helper, tutor.id, input.fromAssignmentId);
    writeItems(setId, ids);
    db().prepare("INSERT INTO assignments (id, set_id, student_id) VALUES (?, ?, ?)").run(newId("asg"), setId, input.studentId);
  })();
  revalidatePath("/tutor", "layout");
  revalidatePath("/student");
  redirect(`/tutor/students/${input.studentId}`);
}
