import { db } from "@/lib/db";
import { flagsFor } from "@/lib/grading";
import { currentUser } from "@/lib/session";

// Paste, tab-away and active-time log for one response. Sent in batches (and with sendBeacon on page hide).
type Body = {
  responseId: string;
  pastes?: { field: string; chars: number }[];
  blurs?: number;
  awayMs?: number;
  activeMs?: number;
};

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user || user.role !== "student") return new Response(null, { status: 401 });
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response(null, { status: 400 });
  }
  const r = db()
    .prepare(
      `SELECT r.id, r.paste_chars, r.away_ms, r.submitted_at, a.status FROM responses r
         JOIN assignments a ON a.id = r.assignment_id WHERE r.id = ? AND r.student_id = ?`,
    )
    .get(String(body.responseId), user.id) as
    | { id: string; paste_chars: number; away_ms: number; submitted_at: string | null; status: string }
    | undefined;
  if (!r) return new Response(null, { status: 404 });
  if (r.status === "submitted" || r.status === "reviewed") return new Response(null, { status: 204 });

  const n = (v: unknown, max: number) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
  const pastes = (body.pastes ?? []).slice(0, 50).map((p) => ({ field: String(p.field).slice(0, 20), chars: n(p.chars, 100_000) }));
  const pasted = pastes.reduce((s, p) => s + p.chars, 0);
  const blurs = n(body.blurs, 1000);
  const away = n(body.awayMs, 24 * 3600_000);
  const active = n(body.activeMs, 3600_000);

  const insert = db().prepare("INSERT INTO events (response_id, type, data) VALUES (?, ?, ?)");
  db().transaction(() => {
    for (const p of pastes) insert.run(r.id, "paste", JSON.stringify(p));
    if (blurs) insert.run(r.id, "blur", JSON.stringify({ count: blurs, awayMs: away }));
    const flags = flagsFor(r.paste_chars + pasted, r.away_ms + away);
    db()
      .prepare(
        `UPDATE responses SET paste_chars = paste_chars + ?, blur_count = blur_count + ?, away_ms = away_ms + ?,
                active_ms = active_ms + ?, flags = ? WHERE id = ?`,
      )
      .run(pasted, blurs, away, active, JSON.stringify(flags), r.id);
  })();
  return new Response(null, { status: 204 });
}
