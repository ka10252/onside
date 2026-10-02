// Loads the unit revision notes from content/source/수업준비/U*.md into the database.
// The notes are written from Jin's own materials and the past papers, so they live in a git-ignored
// folder; the database is how they reach the app.
//   npm run brief:load
import fs from "node:fs";
import path from "node:path";
import { openDb } from "../src/lib/db-core";
import { loadEnv } from "./env";

const DIR = path.join(process.cwd(), "content", "source", "수업준비");

/** Everything after this line is the tutor's, and never reaches the lesson screen. */
const SPLIT = /^<!--\s*tutor only\s*-->\s*$/m;

/** The first bold sentence, which is the one thing to say about the unit. */
function headlineOf(body: string): string {
  return body.match(/\*\*(.+?)\*\*/)?.[1]?.trim() ?? "";
}

async function main() {
  loadEnv();
  if (!fs.existsSync(DIR)) {
    console.error(`No ${DIR}. Nothing to load.`);
    process.exit(1);
  }
  const files = fs.readdirSync(DIR).filter((f) => /^U\d+[-.]/.test(f) && f.endsWith(".md"));
  if (!files.length) {
    console.error(`No U<number>-*.md files in ${DIR}.`);
    process.exit(1);
  }
  const db = await openDb();
  for (const f of files.sort()) {
    const unit = Number(f.match(/^U(\d+)/)![1]);
    const whole = fs.readFileSync(path.join(DIR, f), "utf8");
    const [body = "", tutor = ""] = whole.split(SPLIT);
    await db.run(
      `INSERT INTO unit_briefs (unit, headline, body, tutor, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (unit) DO UPDATE SET headline = excluded.headline, body = excluded.body,
         tutor = excluded.tutor, updated_at = excluded.updated_at`,
      unit,
      headlineOf(body),
      body.trim(),
      tutor.trim(),
      new Date().toISOString(),
    );
    console.log(`  unit ${String(unit).padStart(2)} ← ${f} · student ${body.trim().length} chars · tutor ${tutor.trim().length} chars`);
  }
  console.log(`\n${files.length} ${files.length === 1 ? "brief" : "briefs"} loaded into ${db.kind === "postgres" ? "Supabase" : "the local database"}.`);
  await db.close();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
