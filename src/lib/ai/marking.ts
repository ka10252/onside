import "server-only";
import { after } from "next/server";
import { isPast, pastContext, type Question } from "../content";
import { all, json, one, run } from "../db";
import { contentTypeOf, getFile } from "../storage";
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
  /** A draft of what to write to the student. The tutor edits or replaces it before they see it. */
  comment?: string;
  items?: { item: string; status: string; note: string }[]; // diagram checklist
  error?: string;
  at: string;
};

export type Raw = {
  marks: number;
  band?: string | null;
  evidence?: { point: string; quote: string; met: boolean }[];
  missed?: string[];
  summary_for_tutor?: string[];
  comment_for_student?: string;
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

async function checklistFor(q: Question): Promise<string[] | null> {
  if (isPast(q) || q.format !== "diagram") return null;
  const row = await one<{ data: string }>("SELECT data FROM diagram_checklists WHERE id = ?", q.diagram_checklist);
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
    ? (await pastContext(q.past.paper, q.past.question))
        .map((b) => (b.type === "text" ? b.text : b.type === "table" ? tableText(b) : `[${b.caption ?? "figure"}]`))
        .join("\n")
        .slice(0, 3000)
    : q.table
      ? tableText(q.table)
      : "";
  const images = [];
  if (r.photo_path) {
    const body = await getFile(r.photo_path);
    if (!body) throw new Error("Photo file not found");
    images.push({ mimeType: contentTypeOf(r.photo_path), base64: body.toString("base64") });
  }
  const checklist = await checklistFor(q);
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
 "summary_for_tutor": ["<≤3 bullets, ≤10 words each, blunt facts>"],
 "comment_for_student": "<1 to 3 sentences, written to the student, about this answer: what earned the marks and what it needed to earn the rest. Name the economics. Plain words, sentence case, no greeting, no praise, no encouragement, no emoji, no exclamation marks. Don't restate the mark scheme or write the answer for them.>"${diagramPart ? `,\n "items": []` : ""}}`;
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

/** The model's JSON, cleaned: marks clamped, invented quotes dropped, lists trimmed. Exported for tests. */
export function finish(q: Question, answer: string, raw: Raw): AiMark {
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
    comment: raw.comment_for_student ? String(raw.comment_for_student).trim().slice(0, 500) : undefined,
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

/** Marks every written answer in an assignment that has no suggestion yet. Runs after the response is sent. */
export async function markAssignment(assignmentId: string, force = false) {
  // force: retry failed suggestions only (the "Retry AI marking" button).
  const rows = await all<ResponseForMarking & { ai_mark: string | null; data: string }>(
    `SELECT r.id, r.final_text, r.working_text, r.plan_text, r.photo_path, r.answers, r.attempts, r.ai_mark, q.data
       FROM responses r JOIN questions q ON q.id = r.question_id
      WHERE r.assignment_id = ? AND r.submitted_at IS NOT NULL AND r.tutor_mark IS NULL`,
    assignmentId,
  );
  const todo = rows.filter((r) => {
    const q = JSON.parse(r.data) as Question;
    // Diagrams are marked by the tutor, not the AI (Jin, 2026-09-17).
    const needsAi = q.format !== "diagram" && (isPast(q) || q.format === "short_answer" || q.format === "essay" || q.format === "calculation");
    const prev = json.parse<AiMark | null>(r.ai_mark, null);
    return needsAi && (force ? prev?.status === "error" : !prev);
  });
  if (!todo.length) return;
  const save = (mark: AiMark, id: string) => run("UPDATE responses SET ai_mark = ? WHERE id = ?", JSON.stringify(mark), id);
  let provider;
  try {
    provider = ai();
  } catch (e) {
    for (const r of todo) await save(errorMark(e), r.id);
    return;
  }

  // Claude: one half-price batch per submission; results are collected by pollMarkingBatches().
  if (provider.submitBatch && process.env.AI_MARKING_BATCH !== "off") {
    const built: { r: (typeof todo)[number]; req: Omit<GenerateRequest, "json">; answer: string }[] = [];
    for (const r of todo) {
      try {
        built.push({ r, ...(await buildMarkRequest(JSON.parse(r.data) as Question, r)) });
      } catch (e) {
        await save(errorMark(e), r.id); // e.g. a missing photo file
      }
    }
    if (!built.length) return;
    try {
      const batchId = await provider.submitBatch(built.map((b) => ({ id: b.r.id, req: { ...b.req, json: true } })));
      await run(
        "INSERT INTO ai_batches (id, assignment_id, response_ids) VALUES (?, ?, ?)",
        batchId,
        assignmentId,
        JSON.stringify(built.map((b) => b.r.id)),
      );
      for (const b of built) await save({ status: "pending", at: new Date().toISOString() }, b.r.id);
    } catch (e) {
      for (const b of built) await save(errorMark(e), b.r.id);
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
    await save(mark, r.id);
  }
}

/**
 * Stores finished batch results. Safe to call often: the tutor's pages call it (there is no
 * always-on server on Vercel), and the review page refreshes while a batch is pending.
 */
export async function pollMarkingBatches() {
  let provider;
  try {
    provider = ai();
  } catch {
    return;
  }
  const pending = await all<{ id: string; response_ids: string; created_at: string }>(
    "SELECT id, response_ids, created_at FROM ai_batches WHERE status = 'pending'",
  );
  if (!provider.collectBatch) {
    for (const b of pending) await expireBatch(b.id, b.response_ids);
    return;
  }
  for (const b of pending) {
    let res;
    try {
      res = await provider.collectBatch(b.id);
    } catch (e) {
      console.error("batch poll failed", e);
      // Batches finish within 24 h; after that, give up so the tutor can retry or mark by hand.
      if (Date.now() - new Date(b.created_at).getTime() > 25 * 3600_000) await expireBatch(b.id, b.response_ids);
      continue;
    }
    if (res.status === "pending") continue;
    // Claim the batch so two page loads don't store it twice.
    const claimed = await run("UPDATE ai_batches SET status = 'done' WHERE id = ? AND status = 'pending'", b.id);
    if (!claimed) continue;
    for (const id of JSON.parse(b.response_ids) as string[]) {
      const row = await one<ResponseForMarking & { data: string }>(
        `SELECT r.id, r.final_text, r.working_text, r.plan_text, r.photo_path, r.answers, r.attempts, q.data
           FROM responses r JOIN questions q ON q.id = r.question_id WHERE r.id = ?`,
        id,
      );
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
      await run("UPDATE responses SET ai_mark = ? WHERE id = ?", JSON.stringify(mark), id);
    }
  }
}

async function expireBatch(id: string, responseIds: string) {
  for (const rid of JSON.parse(responseIds) as string[]) {
    await run(
      "UPDATE responses SET ai_mark = ? WHERE id = ? AND (ai_mark::jsonb ->> 'status') = 'pending'",
      JSON.stringify(errorMark(new Error("AI marking timed out"))),
      rid,
    );
  }
  await run("UPDATE ai_batches SET status = 'failed' WHERE id = ?", id);
}

export async function hasPendingBatches(assignmentId: string) {
  return Boolean(await one("SELECT 1 FROM ai_batches WHERE assignment_id = ? AND status = 'pending'", assignmentId));
}

// A marking run is "in progress" for at most this long (the function time limit on Vercel).
const RUN_MS = 5 * 60_000;

/** Starts AI marking after the current response is sent. One run per assignment at a time. */
export function queueMarking(assignmentId: string, force = false) {
  const job = async () => {
    const now = new Date();
    const claimed = await run(
      "UPDATE assignments SET marking_started_at = ? WHERE id = ? AND (marking_started_at IS NULL OR marking_started_at < ?)",
      now.toISOString(),
      assignmentId,
      new Date(now.getTime() - RUN_MS).toISOString(),
    );
    if (!claimed) return;
    try {
      await markAssignment(assignmentId, force);
    } catch (e) {
      console.error("marking failed", e);
    } finally {
      await run("UPDATE assignments SET marking_started_at = NULL WHERE id = ?", assignmentId);
    }
  };
  try {
    after(job);
  } catch {
    void job(); // outside a request (scripts)
  }
}

export async function isMarking(assignmentId: string) {
  const row = await one<{ marking_started_at: string | null }>("SELECT marking_started_at FROM assignments WHERE id = ?", assignmentId);
  return Boolean(row?.marking_started_at && Date.now() - new Date(row.marking_started_at).getTime() < RUN_MS);
}
