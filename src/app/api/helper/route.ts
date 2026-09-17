import { AiNotConfiguredError, type ChatTurn } from "@/lib/ai";
import { helperReply } from "@/lib/ai/helper";
import { db } from "@/lib/db";
import { HELPER_LOCK_MS } from "@/lib/grading";
import { currentUser } from "@/lib/session";
import { hintsFor, isLocked, ownedResponse } from "@/lib/student";

export const maxDuration = 60;

type Body = { responseId: string; message: string; kind?: "question" | "hint_confused" };

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user || user.role !== "student") return Response.json({ error: "Sign in first." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Body | null;
  const message = String(body?.message ?? "").trim().slice(0, 1000);
  if (!body || !message) return Response.json({ error: "Type a question." }, { status: 400 });

  const found = ownedResponse(String(body.responseId), user.id);
  if (!found) return Response.json({ error: "Not found." }, { status: 404 });
  const { r, a, q } = found;
  if (a.helper === "off") return Response.json({ error: "The Helper is off for this set." }, { status: 403 });
  if (isLocked(a)) return Response.json({ error: "This set is closed." }, { status: 403 });
  if (r.submitted_at) return Response.json({ error: "This question is already submitted." }, { status: 403 });
  if (Date.now() < new Date(r.first_viewed_at ?? 0).getTime() + HELPER_LOCK_MS) {
    return Response.json({ error: "Give it a proper try first." }, { status: 403 });
  }

  // Daily cap per student keeps AI spend predictable (HELPER_DAILY_LIMIT, default 15).
  const limit = Number(process.env.HELPER_DAILY_LIMIT || 15);
  const today = db()
    .prepare(
      `SELECT COUNT(*) AS n FROM events e JOIN responses x ON x.id = e.response_id
        WHERE x.student_id = ? AND e.type = 'ai_message_student' AND e.at >= strftime('%Y-%m-%dT00:00:00', 'now', 'localtime', 'utc')`,
    )
    .get(user.id) as { n: number };
  if (limit > 0 && today.n >= limit) {
    return Response.json({ error: "You've used today's Helper questions. Hints still work." }, { status: 429 });
  }

  const past = db()
    .prepare(
      `SELECT type, data FROM events WHERE response_id = ? AND type IN ('ai_message_student', 'ai_message_helper')
        ORDER BY id DESC LIMIT 12`,
    )
    .all(r.id) as { type: string; data: string }[];
  const history: ChatTurn[] = past.reverse().map((e) => ({
    role: e.type === "ai_message_student" ? "user" : "assistant",
    text: String(JSON.parse(e.data).text ?? ""),
  }));

  const insert = db().prepare("INSERT INTO events (response_id, type, data) VALUES (?, ?, ?)");

  try {
    const hints = hintsFor(q);
    const res = await helperReply({
      q,
      hints,
      hintLevel: r.hint_level,
      working: [r.working_text, r.final_text].filter(Boolean).join("\n"),
      history,
      message,
    });
    // Logged only when the Helper answered, so a failed call doesn't count as AI use or against the daily limit.
    db().transaction(() => {
      insert.run(r.id, "ai_message_student", JSON.stringify({ text: message, kind: body.kind ?? "question" }));
      db().prepare("UPDATE responses SET ai_questions = ai_questions + 1 WHERE id = ?").run(r.id);
      insert.run(r.id, "ai_message_helper", JSON.stringify({ text: res.reply, blocked: res.blocked }));
    })();
    if (res.askedForAnswer) insert.run(r.id, "ai_refused_answer", JSON.stringify({ blocked: res.blocked }));
    return Response.json({ reply: res.reply });
  } catch (e) {
    const text =
      e instanceof AiNotConfiguredError
        ? "The Helper isn't set up yet. Ask your tutor."
        : "The Helper is busy. Try again in a minute.";
    console.error("helper failed", e);
    return Response.json({ error: text }, { status: 503 });
  }
}
