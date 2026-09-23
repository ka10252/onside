// Copies accounts, sets and student work from the local database (data/pglite) into Supabase.
// Content (units, questions, past papers) comes from `npm run db:seed`; this adds everything else.
// Safe to re-run: rows are upserted. Never writes back to the local database.
//   npm run db:import-local
import fs from "node:fs";
import path from "node:path";
import { openDb, type Queryable } from "../src/lib/db-core";
import { createStorageClient } from "./storage-client";
import { loadEnv } from "./env";

// Parents before children.
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

async function columnsOf(db: Queryable, table: string) {
  const rows = await db.all<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name = ?", table);
  return new Set(rows.map((r) => r.column_name));
}

async function main() {
  loadEnv();
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set: nothing to copy into.");
  const src = await openDb({ local: true });
  const dst = await openDb({ migrate: true });
  if (dst.kind !== "postgres") throw new Error("The target is not Supabase.");
  console.log("From data/pglite to Supabase");

  await dst.tx(async (t) => {
    for (const { name, key, where } of TABLES) {
      const cols = [...(await columnsOf(t, name))];
      const rows = await src.all<Record<string, unknown>>(`SELECT * FROM ${name}${where ? ` WHERE ${where}` : ""}`);
      for (const row of rows) {
        const use = cols.filter((c) => c in row);
        const updates = use.filter((c) => !key.includes(c));
        await t.run(
          `INSERT INTO ${name} (${use.join(", ")}) VALUES (${use.map(() => "?").join(", ")})
           ON CONFLICT (${key.join(", ")}) DO ${updates.length ? `UPDATE SET ${updates.map((c) => `${c} = excluded.${c}`).join(", ")}` : "NOTHING"}`,
          ...use.map((c) => row[c]),
        );
      }
      console.log(`${name}: ${rows.length}`);
    }
    // Event ids were copied as they are; keep new ones above them.
    await t.run("SELECT setval(pg_get_serial_sequence('events', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM events), 1))");
  });

  // Diagram photos and anything else in data/storage.
  const storage = createStorageClient();
  await storage.ensureBucket();
  const root = path.join(process.cwd(), "data", "storage", "uploads");
  let n = 0;
  if (fs.existsSync(root)) {
    for (const f of fs.readdirSync(root, { recursive: true, withFileTypes: true })) {
      if (!f.isFile()) continue;
      const file = path.join(f.parentPath, f.name);
      const key = path.relative(path.join(process.cwd(), "data", "storage"), file).split(path.sep).join("/");
      const ext = path.extname(file).slice(1).toLowerCase();
      await storage.put(key, fs.readFileSync(file), ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg");
      n++;
    }
  }
  console.log(`photos: ${n}`);
  await src.close();
  await dst.close();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
