"use server";

import fs from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "./db";
import { DATA_DIR } from "./db-core";
import { HELPER_LOCK_MS, hintCap } from "./grading";
import { requireUser } from "./session";
import { finalizeAssignment, getAssignment, GRACE_MS, hintsFor, isLocked, ownedResponse } from "./student";

type Fail = { error: string };
const TIME_UP: Fail = { error: "Time is up for this set." };

async function load(responseId: string) {
  const user = await requireUser("student");
  const found = ownedResponse(responseId, user.id);
  if (!found) throw new Error("Not found");
  return found;
}

function event(responseId: string, type: string, data: object = {}) {
  db().prepare("INSERT INTO events (response_id, type, data) VALUES (?, ?, ?)").run(responseId, type, JSON.stringify(data));
}

// ---------- saving answers (nothing is marked until the set is submitted) ----------

export type Draft = { working?: string; finalText?: string; plan?: string; answers?: string[] };
const clip = (s: string | undefined, n = 20_000) => (s === undefined ? undefined : String(s).slice(0, n));

export async function saveDraft(responseId: string, draft: Draft, snapshot: boolean): Promise<{ ok: true } | Fail> {
  const { r, a } = await load(responseId);
  if (isLocked(a, GRACE_MS)) return TIME_UP;
  if (r.submitted_at) return { error: "Already submitted." };
  const plan = draft.plan !== undefined && isBlankPlan(draft.plan) ? "" : draft.plan;
  const d = { working: clip(draft.working), finalText: clip(draft.finalText), plan: clip(plan) };
  db()
    .prepare(
      `UPDATE responses SET working_text = COALESCE(?, working_text), final_text = COALESCE(?, final_text),
              plan_text = COALESCE(?, plan_text) WHERE id = ?`,
    )
    .run(d.working ?? null, d.finalText ?? null, d.plan ?? null, r.id);
  if (draft.answers) {
    const answers = draft.answers.slice(0, 20).map((x) => String(x).slice(0, 60));
    // No answer yet (e.g. blank calculation boxes) is stored as null, so the question shows as not answered.
    db().prepare("UPDATE responses SET answers = ? WHERE id = ?").run(answers.some((x) => x.trim()) ? JSON.stringify(answers) : null, r.id);
  }
  if (snapshot) event(r.id, "snapshot", { final: d.finalText ?? r.final_text ?? "", plan: d.plan ?? undefined });
  return { ok: true };
}

function isBlankPlan(plan: string) {
  try {
    const v = JSON.parse(plan);
    return Array.isArray(v) && v.every((x) => !String(x).trim());
  } catch {
    return !plan.trim();
  }
}

// HEIC is not accepted: desktop browsers can't show it to the tutor.
const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function uploadPhoto(fd: FormData): Promise<{ ok: true } | Fail> {
  const { r, a } = await load(String(fd.get("responseId") ?? ""));
  if (isLocked(a)) return TIME_UP;
  if (r.submitted_at) return { error: "Already submitted." };
  const file = fd.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a photo." };
  const ext = PHOTO_TYPES[file.type];
  if (!ext) return { error: "Use a JPG or PNG photo. On an iPhone, set Camera → Formats → Most Compatible." };
  if (file.size > 12 * 1024 * 1024) return { error: "The photo must be under 12 MB." };
  const rel = path.join("uploads", a.id, `${r.id}.${ext}`);
  const abs = path.join(DATA_DIR, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, Buffer.from(await file.arrayBuffer()));
  db().prepare("UPDATE responses SET photo_path = ? WHERE id = ?").run(rel, r.id);
  return { ok: true };
}

// ---------- hints ----------

export async function openHint(responseId: string, level: 1 | 2): Promise<{ hint: string; cap: number } | Fail> {
  const { r, a, q } = await load(responseId);
  if (a.helper === "off") return { error: "The Helper is off for this set." };
  if (isLocked(a)) return TIME_UP;
  if (r.submitted_at) return { error: "This question is already submitted." };
  const hints = hintsFor(q);
  if (!hints) return { error: "No hints for this question yet." };
  if (Date.now() < new Date(r.first_viewed_at ?? 0).getTime() + HELPER_LOCK_MS) return { error: "Give it a proper try first." };
  if (level !== r.hint_level + 1) return level <= r.hint_level ? { hint: hints[level - 1], cap: hintCap(r.hint_level) } : { error: "Open Hint 1 first." };
  db().prepare("UPDATE responses SET hint_level = ? WHERE id = ?").run(level, r.id);
  event(r.id, "hint_open", { level });
  return { hint: hints[level - 1], cap: hintCap(level) };
}

// ---------- assignment ----------

export async function submitAssignment(assignmentId: string) {
  const user = await requireUser("student");
  const a = getAssignment(assignmentId, user.id);
  if (!a) redirect("/student");
  if (a.status === "in_progress" || a.status === "not_started") finalizeAssignment(a.id);
  revalidatePath("/student");
  revalidatePath("/tutor", "layout");
  redirect(`/student/a/${a.id}/done`);
}
