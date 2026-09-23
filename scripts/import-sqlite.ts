// One-off: copies accounts and student work from the old SQLite file (data/onside.db) into the
// current database (Supabase when DATABASE_URL is set). Run after `npm run db:seed`. Safe to re-run.
//   npm run db:import-sqlite
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { openDb } from "../src/lib/db-core";
import { loadEnv } from "./env";
import { createStorageClient } from "./storage-client";

const SQLITE = path.join(process.cwd(), "data", "onside.db");

// Parents before children. Content tables come from the seed; only Jin's and the students' data is copied.
const TABLES: { name: string; key: string[]; where?: string }[] = [
  { name: "users", key: ["id"] },
  { name: "questions", key: ["id"], where: "source = 'ai'" },
  { name: "hint_overrides", key: ["question_id"] },
  { name: "sets", key: ["id"] },
  { name: "set_items", key: ["set_id", "position"] },
  { name: "assignments", key: ["id"] },
  { name: "responses", key: ["id"] },
  { name: "events", key: ["id"] },
  { name: "ai_batches", key: ["id"] },
];

async function main() {
  loadEnv();
  if (!fs.existsSync(SQLITE)) throw new Error(`${SQLITE} not found`);
  const src = new Database(SQLITE, { readonly: true });
  const db = await openDb({ migrate: true });
  const storage = createStorageClient();
  console.log(`From ${path.relative(process.cwd(), SQLITE)} to ${db.kind === "postgres" ? "Supabase" : "data/pglite"}`);

  await db.tx(async (t) => {
    for (const { name, key, where } of TABLES) {
      const target = new Set(
        (await t.all<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name = ?", name)).map(
          (c) => c.column_name,
        ),
      );
      const rows = src.prepare(`SELECT * FROM ${name}${where ? ` WHERE ${where}` : ""}`).all() as Record<string, unknown>[];
      for (const row of rows) {
        const cols = Object.keys(row).filter((c) => target.has(c));
        const updates = cols.filter((c) => !key.includes(c));
        await t.run(
          `INSERT INTO ${name} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})
           ON CONFLICT (${key.join(", ")}) DO ${updates.length ? `UPDATE SET ${updates.map((c) => `${c} = excluded.${c}`).join(", ")}` : "NOTHING"}`,
          ...cols.map((c) => row[c]),
        );
      }
      console.log(`${name}: ${rows.length}`);
    }
    // Keep event ids moving forward after copying explicit ids.
    await t.run("SELECT setval(pg_get_serial_sequence('events', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM events), 1))");
  });

  // Diagram photos: data/uploads/<assignment>/<response>.<ext> -> storage uploads/…
  const photos = src.prepare("SELECT id, photo_path FROM responses WHERE photo_path IS NOT NULL").all() as { id: string; photo_path: string }[];
  for (const p of photos) {
    const file = path.join(process.cwd(), "data", p.photo_path);
    const key = p.photo_path.split(path.sep).join("/");
    if (!fs.existsSync(file)) {
      console.log(`missing photo ${p.photo_path}`);
      continue;
    }
    const ext = path.extname(file).slice(1).toLowerCase();
    await storage.ensureBucket();
    await storage.put(key, fs.readFileSync(file), ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg");
    await db.run("UPDATE responses SET photo_path = ? WHERE id = ?", key, p.id);
  }
  console.log(`photos: ${photos.length}`);
  src.close();
  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
