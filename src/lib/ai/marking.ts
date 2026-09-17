import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { isPast, pastContext, type Question } from "../content";
import { db, json } from "../db";
import { DATA_DIR } from "../db-core";
import { ai, extractJson, generateJson, type GenerateRequest } from "./index";
import { referenceFor, tableText } from "./helper";

// Marking suggestions (docs/ai-prompts.md 3 and 4). The tutor confirms; the student never sees them before that.
// Privacy: only the question, mark scheme and the student's own answer text/photo are sent — never a name or id.

export type AiMark = {
  status: "done" | "error" | "pending";
  marks?: number;
  band?: string | null;
  evidence?: { point: string; quote: string; met: boolean }[];
  missed?: string[];
  summary?: string[];
  items?: { item: string; status: string; note: string }[]; // diagram checklist
  error?: string;
  at: string;
};

type Raw = {
  marks: number;
  band?: string | null;
  evidence?: { point: string; quote: string; met: boolean }[];
  missed?: string[];
  summary_for_tutor?: string[];
  items?: { item: string; status: string; note: string }[];
};
const isRaw = (v: unknown): v is Raw => typeof v === "object" && v !== null && typeof (v as Raw).marks === "number";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9%.]+/g, " ").trim();

function markingText(q: Question): string {
  if (isPast(q)) return `Official mark scheme:\n${q.marking.text.slice(0, 6000)}`;
  if (q.format === "essay" || (q.format === "short_answer" && q.marking)) {
    const m = q.marking!;
    return `Bands: ${m.rubric}\nKey content:\n- ${m.key_content.join("\n- ")}${
      m.evaluation_angles ? `\nEvaluation:\n- ${m.evaluation_angles.join("\n- ")}` : ""
    }`;
  }
  if (q.format === "diagram") {
    const m = q.marking;
    return `Levels: ${m.levels.map((l) => `${l.marks}: ${l.descriptor}`).join("; ")}. ${m.cap ?? ""}\n${referenceFor(q)}`;
  }
  return referenceFor(q);
}

function checklistFor(q: Question): string[] | null {
  if (isPast(q) || q.format !== "diagram") return null;
  const row = db().prepare("SELECT data FROM diagram_checklists WHERE id = ?").get(q.diagram_checklist) as { data: string } | undefined;
  return row ? (JSON.parse(row.data).items as string[]) : null;
}

type ResponseForMarking = {
  id: string;
  final_text: string | null;
  working_text: string | null;
  plan_text: string | null;
  photo_path: string | null;
  answers: string | null;
  attempts: string;
};

async function buildMarkRequest(q: Question, r: ResponseForMarking): Promise<{ req: Omit<GenerateRequest, "json">; answer: string }> {
  const answer = [
    r.working_text ? `Working:\n${r.working_text}` : "",
    r.answers ? `Final answers entered: ${json.parse<string[]>(r.answers, []).join(" | ")}` : "",
    r.final_text ? `Answer:\n${r.final_text}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const context = isPast(q)
    ? pastContext(q.past.paper, q.past.question)
        .map((b) => (b.type === "text" ? b.text : b.type === "table" ? tableText(b) : `[${b.caption ?? "figure"}]`))
        .join("\n")
        .slice(0, 3000)
    : q.table
      ? tableText(q.table)
      : "";
  const images = [];
  if (r.photo_path) {
    const file = path.join(DATA_DIR, r.photo_path);
    const ext = path.extname(file).slice(1);
    const mime = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
    images.push({ mimeType: mime, base64: (await fs.readFile(file)).toString("base64") });
  }
  const checklist = checklistFor(q);
  const diagramPart =
    r.photo_path || checklist
      ? `\nA photo of the student's hand-drawn diagram is attached${r.photo_path ? "" : " (none was uploaded)"}. Check it${
          checklist ? ` against this checklist:\n- ${checklist.join("\n- ")}` : " against the mark scheme"
        }. If something is unreadable, say so rather than guess. Put each check in "items" as {"item","status":"present"|"missing"|"wrong"|"unreadable","note"}.`
      : "";
  // Stable part first (instructions, question, mark scheme) so repeated marking of one question can hit the cache.
  const system = `Mark IB Economics answers. Be strict and consistent with the reference. Use only evidence in the student's text${
    images.length ? " and photo" : ""
  }.
${context ? `Extracts and data:\n${context}\n` : ""}Question: ${q.prompt} [${q.marks}]
Marking:
${markingText(q)}
Return JSON:
{"marks": n,
 "band": "<band or null>",
 "evidence": [{"point": "<marking point or band criterion>", "quote": "<exact words from the student>", "met": true|false}],
 "missed": ["<marking points not met>"],
 "summary_for_tutor": ["<≤3 bullets, ≤10 words each, blunt facts>"]${diagramPart ? `,\n "items": []` : ""}}`;
  return {
    answer,
    req: {
      task: "marking",
      temperature: 0,
      images,
      system,
      turns: [
        {
          role: "user",
          text: `${r.plan_text ? `Student plan: ${r.plan_text.slice(0, 2000)}\n` : ""}Student answer:
${answer.slice(0, 12000) || "(no written answer)"}${diagramPart}`,
        },
      ],
    },
  };
}

function finish(q: Question, answer: string, raw: Raw): AiMark {
  const text = norm(answer);
  return {
    status: "done",
    marks: Math.max(0, Math.min(q.marks, Math.round(raw.marks))),
    band: raw.band ?? null,
    // Keep only quotes that really appear in the answer.
    evidence: (raw.evidence ?? [])
      .filter((e) => e && typeof e.point === "string")
      .map((e) => ({ point: e.point, quote: String(e.quote ?? ""), met: Boolean(e.met) }))
      .filter((e) => !e.quote || text.includes(norm(e.quote)))
      .slice(0, 12),
    missed: (raw.missed ?? []).map(String).slice(0, 10),
    summary: (raw.summary_for_tutor ?? []).map(String).slice(0, 3),
    items: raw.items?.slice(0, 12),
    at: new Date().toISOString(),
  };
}

export async function suggestMark(q: Question, r: ResponseForMarking): Promise<AiMark> {
  const { req, answer } = await buildMarkRequest(q, r);
  return finish(q, answer, await generateJson(req, isRaw));
}

const errorMark = (e: unknown): AiMark => ({
  status: "error",
  error: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200),
  at: new Date().toISOString(),
});

/** Marks every written answer in an assignment that has no suggestion yet. Runs in the background. */
export async function markAssignment(assignmentId: string, force = false) {
  // force: retry failed suggestions only (the "Retry AI marking" button).
  const rows = db()
    .prepare(
      `SELECT r.id, r.final_text, r.working_text, r.plan_text, r.photo_path, r.answers, r.attempts, r.ai_mark, q.data
         FROM responses r JOIN questions q ON q.id = r.question_id
        WHERE r.assignment_id = ? AND r.submitted_at IS NOT NULL AND r.tutor_mark IS NULL`,
    )
    .all(assignmentId) as (ResponseForMarking & { ai_mark: string | null; data: string })[];
  const todo = rows.filter((r) => {
    const q = JSON.parse(r.data) as Question;
    // Diagrams are marked by the tutor, not the AI (Jin, 2026-09-17).
    const needsAi = q.format !== "diagram" && (isPast(q) || q.format === "short_answer" || q.format === "essay" || q.format === "calculation");
    const prev = json.parse<AiMark | null>(r.ai_mark, null);
    return needsAi && (force ? prev?.status === "error" : !prev);
  });
  if (!todo.length) return;
  const save = db().prepare("UPDATE responses SET ai_mark = ? WHERE id = ?");
  let provider;
  try {
    provider = ai();
  } catch (e) {
    for (const r of todo) save.run(JSON.stringify(errorMark(e)), r.id);
    return;
  }

  // Claude: one half-price batch per submission; results are collected by pollMarkingBatches().
  if (provider.submitBatch && process.env.AI_MARKING_BATCH !== "off") {
    const built: { r: (typeof todo)[number]; req: Omit<GenerateRequest, "json">; answer: string }[] = [];
    for (const r of todo) {
      try {
        built.push({ r, ...(await buildMarkRequest(JSON.parse(r.data) as Question, r)) });
      } catch (e) {
        save.run(JSON.stringify(errorMark(e)), r.id); // e.g. a missing photo file
      }
    }
    if (!built.length) return;
    try {
      const batchId = await provider.submitBatch(built.map((b) => ({ id: b.r.id, req: { ...b.req, json: true } })));
      db()
        .prepare("INSERT INTO ai_batches (id, assignment_id, response_ids) VALUES (?, ?, ?)")
        .run(batchId, assignmentId, JSON.stringify(built.map((b) => b.r.id)));
      for (const b of built) save.run(JSON.stringify({ status: "pending", at: new Date().toISOString() }), b.r.id);
      startPolling();
    } catch (e) {
      for (const b of built) save.run(JSON.stringify(errorMark(e)), b.r.id);
    }
    return;
  }

  for (const r of todo) {
    let mark: AiMark;
    try {
      mark = await suggestMark(JSON.parse(r.data) as Question, r);
    } catch (e) {
      mark = errorMark(e);
    }
    save.run(JSON.stringify(mark), r.id);
  }
}

/** Stores finished batch results. Safe to call often. */
export async function pollMarkingBatches() {
  let provider;
  try {
    provider = ai();
  } catch {
    return;
  }
  if (!provider.collectBatch) {
    const stale = db().prepare("SELECT id, response_ids FROM ai_batches WHERE status = 'pending'").all() as { id: string; response_ids: string }[];
    for (const b of stale) expireBatch(b.id, b.response_ids);
    return;
  }
  const pending = db()
    .prepare("SELECT id, response_ids, created_at FROM ai_batches WHERE status = 'pending'")
    .all() as { id: string; response_ids: string; created_at: string }[];
  for (const b of pending) {
    let res;
    try {
      res = await provider.collectBatch(b.id);
    } catch (e) {
      console.error("batch poll failed", e);
      // Batches finish within 24 h; after that, give up so the tutor can retry or mark by hand.
      if (Date.now() - new Date(b.created_at).getTime() > 25 * 3600_000) expireBatch(b.id, b.response_ids);
      continue;
    }
    if (res.status === "pending") continue;
    const save = db().prepare("UPDATE responses SET ai_mark = ? WHERE id = ?");
    for (const id of JSON.parse(b.response_ids) as string[]) {
      const row = db()
        .prepare("SELECT r.id, r.final_text, r.working_text, r.plan_text, r.photo_path, r.answers, r.attempts, q.data FROM responses r JOIN questions q ON q.id = r.question_id WHERE r.id = ?")
        .get(id) as (ResponseForMarking & { data: string }) | undefined;
      if (!row) continue;
      const q = JSON.parse(row.data) as Question;
      const out = res.results.get(id);
      let mark: AiMark;
      try {
        if (!out || "error" in out) throw new Error(out ? out.error : "missing result");
        const raw = extractJson(out.text);
        if (!isRaw(raw)) throw new Error("schema mismatch");
        mark = finish(q, (await buildMarkRequest(q, { ...row, photo_path: null })).answer, raw);
      } catch (e) {
        mark = errorMark(e);
      }
      save.run(JSON.stringify(mark), id);
    }
    db().prepare("UPDATE ai_batches SET status = 'done' WHERE id = ?").run(b.id);
  }
}

function expireBatch(id: string, responseIds: string) {
  const save = db().prepare("UPDATE responses SET ai_mark = ? WHERE id = ? AND json_extract(ai_mark, '$.status') = 'pending'");
  for (const rid of JSON.parse(responseIds) as string[]) save.run(JSON.stringify(errorMark(new Error("AI marking timed out"))), rid);
  db().prepare("UPDATE ai_batches SET status = 'failed' WHERE id = ?").run(id);
}

const gp = globalThis as unknown as { onsideBatchTimer?: ReturnType<typeof setInterval> };
function startPolling() {
  gp.onsideBatchTimer ??= setInterval(() => {
    void pollMarkingBatches().catch((e) => console.error("batch poll failed", e));
  }, 60_000);
}

export function hasPendingBatches(assignmentId: string) {
  return Boolean(db().prepare("SELECT 1 FROM ai_batches WHERE assignment_id = ? AND status = 'pending'").get(assignmentId));
}

// Survives dev hot reloads.
const g = globalThis as unknown as { onsideMarking?: Set<string> };
const running = (g.onsideMarking ??= new Set<string>());

export function queueMarking(assignmentId: string, force = false) {
  if (running.has(assignmentId)) return;
  running.add(assignmentId);
  void markAssignment(assignmentId, force)
    .catch((e) => console.error("marking failed", e))
    .finally(() => running.delete(assignmentId));
}

export const isMarking = (assignmentId: string) => running.has(assignmentId);
