import "server-only";
import type { AiMark } from "./ai/marking";
import { isPast, type Question } from "./content";
import { db, json } from "./db";
import { conceptStatus, scoreSet, weakSpot, type ScoredQuestion } from "./scoring";
import { isWritten, type ResponseRow } from "./student";

export type TutorMark = { marks: number; note?: string; confirmed_at: string };

type EventRow = { id: number; response_id: string; at: string; type: string; data: string };

export type ReviewItem = {
  n: number;
  q: Question;
  r: (ResponseRow & { flags: string; paste_chars: number; away_ms: number; blur_count: number; active_ms: number; ai_mark: string | null; tutor_mark: string | null }) | null;
  confirmed: number | null;
  auto: boolean;
  aiMark: AiMark | null;
  tutorMark: TutorMark | null;
  result: string;
  bullets: string[];
  honesty: string | null;
  log: { at: string; who: "student" | "helper" | "marker"; text: string }[];
  snapshots: { at: string; text: string }[];
  concepts: { key: string; label: string }[];
  timeMin: number;
};

const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const ordinal = (n: number) => ["1st", "2nd", "3rd"][n - 1] ?? `${n}th`;
const words = (s: string, n: number) => s.split(/\s+/).slice(0, n).join(" ") + (s.split(/\s+/).length > n ? "…" : "");

export function conceptsFor(q: Question): { key: string; label: string }[] {
  if (isPast(q)) {
    if (!q.section) return [];
    const s = db().prepare("SELECT title FROM sections WHERE id = ?").get(q.section) as { title: string } | undefined;
    return [{ key: `s:${q.section}`, label: `${q.section} ${s?.title ?? ""}`.trim() }];
  }
  if (!q.concepts.length && q.section) {
    const s = db().prepare("SELECT title FROM sections WHERE id = ?").get(q.section) as { title: string } | undefined;
    return [{ key: `s:${q.section}`, label: `${q.section} ${s?.title ?? ""}`.trim() }];
  }
  const get = db().prepare("SELECT term FROM concepts WHERE id = ?");
  return q.concepts.map((id) => ({ key: id, label: (get.get(id) as { term: string } | undefined)?.term ?? id }));
}

/** Marks that count: tutor's, else auto result, else 0 for no answer; null while waiting for the tutor. */
export function confirmedMarks(q: Question, r: ReviewItem["r"], closed: boolean): { marks: number | null; auto: boolean } {
  const tutor = json.parse<TutorMark | null>(r?.tutor_mark, null);
  if (tutor) return { marks: tutor.marks, auto: false };
  const auto = !isWritten(q) && (q.format === "mcq" || q.format === "analysis_chain");
  if (!r) return { marks: closed ? 0 : null, auto };
  if (auto) return { marks: r.auto_marks ?? (closed ? 0 : null), auto };
  const answered = Boolean(r.final_text?.trim() || r.photo_path || r.answers);
  if (!answered && closed) return { marks: 0, auto };
  return { marks: null, auto };
}

function describe(q: Question, r: NonNullable<ReviewItem["r"]>, events: EventRow[], aiMark: AiMark | null) {
  const bullets: string[] = [];
  const attempts = json.parse<{ correct: boolean }[]>(r.attempts, []);
  if (attempts.length) {
    const hit = attempts.findIndex((a) => a.correct);
    if (q.format !== "mcq" && attempts.length > 1) bullets.push(hit >= 0 ? `Correct on ${ordinal(hit + 1)} try` : `Wrong ${attempts.length}×`);
  }
  for (const e of events.filter((e) => e.type === "attempt")) {
    const d = json.parse<{ misconception?: string }>(e.data, {});
    if (d.misconception) bullets.push(`Misconception: ${words(d.misconception, 9)}`);
  }
  const help = [];
  if (r.hint_level) help.push(r.hint_level === 2 ? "both hints" : "Hint 1");
  if (r.ai_questions) help.push(`${r.ai_questions} AI ${r.ai_questions === 1 ? "prompt" : "prompts"}`);
  if (help.length) bullets.push(`Used ${help.join(" + ")}`);
  const refused = events.filter((e) => e.type === "ai_refused_answer").length;
  if (refused) bullets.push(`Asked for the answer ${refused === 1 ? "once" : `${refused}×`} — refused`);
  for (const s of aiMark?.summary ?? []) bullets.push(s);

  const honesty = [];
  const pastes = events.filter((e) => e.type === "paste");
  if (r.paste_chars) honesty.push(`Pasted ${r.paste_chars} characters${pastes.length > 1 ? ` (${pastes.length}×)` : ""}`);
  if (r.blur_count) honesty.push(`Left tab ${r.blur_count}× (${Math.max(1, Math.round(r.away_ms / 60000))} min)`);
  return { bullets: bullets.slice(0, 4), honesty: honesty.length ? honesty.join(" · ") : null };
}

function result(q: Question, r: ReviewItem["r"], confirmed: number | null, auto: boolean): string {
  if (!r) return "Not opened";
  const attempts = json.parse<{ correct: boolean }[]>(r.attempts, []);
  if (auto) {
    if (!attempts.length) return "No answer";
    const hit = attempts.findIndex((a) => a.correct);
    if (q.format === "mcq" || attempts.length === 1) return attempts[0]!.correct ? "Correct" : "Wrong";
    return hit >= 0 ? `Correct · ${ordinal(hit + 1)} try` : `Wrong · ${attempts.length} tries`;
  }
  if (!r.final_text?.trim() && !r.photo_path && !r.answers) return "No answer";
  if (confirmed !== null) return `${confirmed}/${q.marks} marks`;
  if (q.format === "calculation" && !isPast(q)) {
    const hit = attempts.findIndex((a) => a.correct);
    if (attempts.length <= 1) return attempts[0]?.correct ? "Final correct" : "Final wrong";
    return hit >= 0 ? `Final correct · ${ordinal(hit + 1)} try` : "Final wrong";
  }
  return "To confirm";
}

export function loadReview(assignmentId: string) {
  const a = db()
    .prepare(
      `SELECT a.*, s.title, s.helper, s.time_limit_min, u.name AS student_name, u.subtitle AS student_subtitle
         FROM assignments a JOIN sets s ON s.id = a.set_id JOIN users u ON u.id = a.student_id WHERE a.id = ?`,
    )
    .get(assignmentId) as
    | {
        id: string; set_id: string; student_id: string; status: string; due_at: string | null; started_at: string | null;
        submitted_at: string | null; reviewed_at: string | null; title: string; helper: string; time_limit_min: number | null;
        student_name: string; student_subtitle: string | null;
      }
    | undefined;
  if (!a) return null;
  const closed = a.status === "submitted" || a.status === "reviewed";
  const qs = (
    db()
      .prepare("SELECT q.data FROM set_items i JOIN questions q ON q.id = i.question_id WHERE i.set_id = ? ORDER BY i.position")
      .all(a.set_id) as { data: string }[]
  ).map((x) => JSON.parse(x.data) as Question);
  const responses = new Map(
    (db().prepare("SELECT * FROM responses WHERE assignment_id = ?").all(a.id) as NonNullable<ReviewItem["r"]>[]).map((r) => [r.question_id, r]),
  );
  const events = db()
    .prepare("SELECT e.* FROM events e JOIN responses r ON r.id = e.response_id WHERE r.assignment_id = ? ORDER BY e.id")
    .all(a.id) as EventRow[];

  const items: ReviewItem[] = qs.map((q, i) => {
    const r = responses.get(q.id) ?? null;
    const ev = r ? events.filter((e) => e.response_id === r.id) : [];
    const aiMark = json.parse<AiMark | null>(r?.ai_mark, null);
    const { marks, auto } = confirmedMarks(q, r, closed);
    const start = r?.first_viewed_at ? new Date(r.first_viewed_at).getTime() : 0;
    const rel = (at: string) => mmss(new Date(at.endsWith("Z") ? at : `${at}Z`).getTime() - start);
    const log: ReviewItem["log"] = [];
    const snapshots: ReviewItem["snapshots"] = [];
    for (const e of ev) {
      const d = json.parse<Record<string, unknown>>(e.data, {});
      if (e.type === "ai_message_student") log.push({ at: rel(e.at), who: "student", text: String(d.text ?? "") });
      else if (e.type === "ai_message_helper") log.push({ at: rel(e.at), who: "helper", text: String(d.text ?? "") + (d.blocked ? " (reply replaced: it gave too much away)" : "") });
      else if (e.type === "hint_open") log.push({ at: rel(e.at), who: "marker", text: `Hint ${d.level} opened` });
      else if (e.type === "snapshot" && typeof d.final === "string") {
        if (!snapshots.length || snapshots.at(-1)!.text !== d.final) snapshots.push({ at: rel(e.at), text: d.final });
      }
    }
    const described = r ? describe(q, r, ev, aiMark) : { bullets: [], honesty: null };
    return {
      n: i + 1,
      q,
      r,
      confirmed: marks,
      auto,
      aiMark,
      tutorMark: json.parse<TutorMark | null>(r?.tutor_mark, null),
      result: result(q, r, marks, auto),
      bullets: described.bullets,
      honesty: described.honesty,
      log,
      snapshots,
      concepts: conceptsFor(q),
      timeMin: Math.round((r?.active_ms ?? 0) / 60000),
    };
  });

  const scored: ScoredQuestion[] = items.map((it) => ({
    id: it.q.id,
    marks: it.q.marks,
    hintLevel: it.r?.hint_level ?? 0,
    aiQuestions: it.r?.ai_questions ?? 0,
    flags: json.parse<string[]>(it.r?.flags, []),
    confirmed: it.confirmed,
    concepts: it.concepts,
    answered: it.result !== "No answer" && it.result !== "Not opened",
  }));
  const score = scoreSet(scored);
  const concepts = conceptStatus(scored, (i) => `Q${i + 1}`);
  const facts = {
    minutes: Math.round(items.reduce((s, it) => s + (it.r?.active_ms ?? 0), 0) / 60000),
    aiQuestions: items.reduce((s, it) => s + (it.r?.ai_questions ?? 0), 0),
    hints: items.reduce((s, it) => s + (it.r?.hint_level ?? 0), 0),
  };
  return { a, closed, items, scored, score, concepts, weak: weakSpot(concepts), facts };
}

export type Review = NonNullable<ReturnType<typeof loadReview>>;

/** Latest reviewed-or-submitted assignment summary for the students list. */
export function latestSummary(studentId: string) {
  const row = db()
    .prepare(
      `SELECT id FROM assignments WHERE student_id = ? AND status IN ('submitted', 'reviewed')
        ORDER BY COALESCE(submitted_at, assigned_at) DESC LIMIT 1`,
    )
    .get(studentId) as { id: string } | undefined;
  if (!row) return null;
  const rv = loadReview(row.id);
  if (!rv) return null;
  return {
    assignmentId: row.id,
    independent: rv.score.independent,
    supported: rv.score.supported,
    pending: rv.score.pending,
    needs: rv.concepts.filter((c) => c.status === "needs").length,
    shaky: rv.concepts.filter((c) => c.status === "shaky").length,
    solid: rv.concepts.filter((c) => c.status === "solid").length,
  };
}
