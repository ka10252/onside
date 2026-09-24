// How long the database takes to answer from the running server. No data, just milliseconds,
// so a slow page can be told apart from a slow database.
import { all } from "@/lib/db";

export const maxDuration = 20;

export async function GET() {
  const started = Date.now();
  try {
    await all("SELECT 1");
    const first = Date.now() - started;
    const again = Date.now();
    await all("SELECT 1");
    return Response.json({ ok: true, firstQueryMs: first, secondQueryMs: Date.now() - again });
  } catch (e) {
    return Response.json({ ok: false, ms: Date.now() - started, error: e instanceof Error ? e.message.slice(0, 200) : "unknown" }, { status: 503 });
  }
}
