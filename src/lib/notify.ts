import "server-only";
import { one } from "./db";

/**
 * A message to the tutor's phone when something happens that needs them. Telegram, because it is
 * free, arrives as a push, and needs no domain (docs/decisions.md). Without the two settings it
 * does nothing at all, so local runs and tests never send anything.
 */
const API = "https://api.telegram.org";

function config() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  return token && chat ? { token, chat } : null;
}

/** Telegram's HTML mode only allows a few tags; everything else has to be escaped. */
export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The address this deployment is reachable at, for links in a message. */
function siteUrl(): string | null {
  const raw = process.env.ONSIDE_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (!raw) return null;
  return raw.startsWith("http") ? raw.replace(/\/$/, "") : `https://${raw}`;
}

export async function send(html: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  const c = config();
  if (!c) return false;
  try {
    const res = await fetcher(`${API}/bot${c.token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: c.chat, text: html, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    if (!res.ok) console.error("telegram refused the message", res.status, (await res.text()).slice(0, 200));
    return res.ok;
  } catch (e) {
    // A notification is never worth failing a student's submit for.
    console.error("telegram send failed", e);
    return false;
  }
}

type Submitted = {
  name: string;
  title: string;
  student_id: string;
  questions: number;
  minutes: number;
  ai_questions: number;
  hints: number;
};

/** "홍길동 · submitted", what the set was, how it went, and a link straight to the marking screen. */
export async function notifySubmitted(assignmentId: string): Promise<boolean> {
  if (!config()) return false;
  const a = await one<Submitted>(
    `SELECT u.name, s.title, a.student_id,
            (SELECT COUNT(*)::int FROM set_items i WHERE i.set_id = a.set_id) AS questions,
            (SELECT COALESCE(ROUND(SUM(r.active_ms) / 60000.0), 0)::int FROM responses r WHERE r.assignment_id = a.id) AS minutes,
            (SELECT COALESCE(SUM(r.ai_questions), 0)::int FROM responses r WHERE r.assignment_id = a.id) AS ai_questions,
            (SELECT COALESCE(SUM(r.hint_level), 0)::int FROM responses r WHERE r.assignment_id = a.id) AS hints
       FROM assignments a JOIN sets s ON s.id = a.set_id JOIN users u ON u.id = a.student_id
      WHERE a.id = ?`,
    assignmentId,
  );
  if (!a) return false;
  return send(submittedMessage(a, assignmentId, siteUrl()));
}

/** Pure, so the wording can be tested without sending anything. */
export function submittedMessage(a: Submitted, assignmentId: string, site: string | null): string {
  const help =
    a.hints === 0 && a.ai_questions === 0
      ? "no help"
      : [a.hints > 0 ? `${a.hints} ${a.hints === 1 ? "hint" : "hints"}` : "", a.ai_questions > 0 ? `Helper ×${a.ai_questions}` : ""]
          .filter(Boolean)
          .join(" · ");
  const facts = [`${a.questions} ${a.questions === 1 ? "question" : "questions"}`, a.minutes > 0 ? `${a.minutes} min` : "", help]
    .filter(Boolean)
    .join(" · ");
  const link = site ? `\n${site}/tutor/students/${a.student_id}/a/${assignmentId}` : "";
  return `<b>${escapeHtml(a.name)}</b> submitted\n${escapeHtml(a.title)}\n${escapeHtml(facts)}${link}`;
}
