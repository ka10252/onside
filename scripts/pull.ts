// Copies the live data (Supabase) into the local database in data/pglite, so `npm run dev:local`
// shows what the deployed site shows, without the round trip to the other side of the Bay of Bengal.
// Local-only: it never writes to Supabase.
//   npm run db:pull
import fs from "node:fs";
import path from "node:path";
import { openDb, type Queryable } from "../src/lib/db-core";
import { loadEnv } from "./env";

// Everything that is not content. Children first for deleting, parents first for inserting.
const TABLES: { name: string; where?: string }[] = [
  { name: "users" },
  { name: "questions", where: "source = 'ai'" },
  { name: "hint_overrides" },
  { name: "sets" },
  { name: "set_items" },
  { name: "assignments" },
  { name: "responses" },
  { name: "events" },
  { name: "ai_batches" },
  // What was taught, which notes the student can read, and whether they have read them.
  { name: "lessons" },
  { name: "lesson_items" },
  { name: "note_reads" },
  { name: "note_releases" },
  { name: "queued_sets" },
  { name: "schedules" },
  // Written by the tutor, not by the seed: outlines and note corrections.
  { name: "essay_outlines" },
  { name: "note_corrections" },
];

/** Loaded by `npm run db:seed` from content/ and the past papers, so there is nothing to copy. */
const SEEDED = [
  "units", "parts", "sections", "concepts", "question_concepts", "unit_briefs", "diagram_checklists",
  "past_papers", "past_items", "past_questions", "unit_past_items",
];
/** Rebuilt locally rather than copied: sign-ins are local, and the lockout log is not data. */
const LOCAL_ONLY = ["sessions", "login_failures"];

async function columnsOf(db: Queryable, table: string) {
  const rows = await db.all<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name = ?", table);
  return rows.map((r) => r.column_name);
}


/** The local database is a single file opened by one process at a time. */
function warnIfServerRunning() {
  console.log("Note: stop `npm run dev:local` before this, and start it again after, or it keeps serving the old copy.");
}

async function main() {
  loadEnv();
  warnIfServerRunning();
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set: there is nothing to copy from.");
  const src = await openDb();
  const dst = await openDb({ local: true, migrate: true });
  if (src.kind !== "postgres") throw new Error("DATABASE_URL does not point at Supabase.");
  console.log("From Supabase to data/pglite");

  // A table added to the schema and not to one of the lists above is either copied as nothing or
  // deleted and never put back, which is how note_releases went missing (2026-10-08). Say so.
  const known = new Set([...TABLES.map((t) => t.name), ...SEEDED, ...LOCAL_ONLY, "questions"]);
  const missing = (
    await src.all<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
    )
  )
    .map((r) => r.table_name)
    .filter((t) => !known.has(t));
  if (missing.length) console.log(`Not copied, not seeded: ${missing.join(", ")}. Add them to TABLES or SEEDED.`);

  await dst.tx(async (t) => {
    await t.run("DELETE FROM sessions"); // everyone signs in again locally
    for (const { name } of [...TABLES].reverse()) await t.run(`DELETE FROM ${name}${name === "questions" ? " WHERE source = 'ai'" : ""}`);
    for (const { name, where } of TABLES) {
      const cols = await columnsOf(t, name);
      const rows = await src.all<Record<string, unknown>>(`SELECT * FROM ${name}${where ? ` WHERE ${where}` : ""}`);
      for (const row of rows) {
        const use = cols.filter((c) => c in row);
        await t.run(`INSERT INTO ${name} (${use.join(", ")}) VALUES (${use.map(() => "?").join(", ")})`, ...use.map((c) => row[c]));
      }
      console.log(`${name}: ${rows.length}`);
    }
    await t.run("SELECT setval(pg_get_serial_sequence('events', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM events), 1))");
  });

  // Diagram photos, so they show on the local screens too.
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const photos = await src.all<{ photo_path: string }>("SELECT photo_path FROM responses WHERE photo_path IS NOT NULL");
  let got = 0;
  for (const p of photos) {
    if (!url || !key) break;
    const res = await fetch(`${url}/storage/v1/object/authenticated/onside/${p.photo_path}`, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) continue;
    const file = path.join(process.cwd(), "data", "storage", p.photo_path);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    got++;
  }
  console.log(`photos: ${got} of ${photos.length}`);
  await src.close();
  await dst.close();
  console.log("Done. `npm run dev:local` now shows this copy.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
