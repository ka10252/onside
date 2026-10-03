// Loads the model answer outlines from content/source/수업준비/에세이-아웃라인.md into the database.
// Each outline starts with "## <question id>" and runs to the next one. They are the tutor's: the
// teaching screen keeps them shut until the tutor opens them, and the student's notes never hold them.
//   npm run outline:load
import fs from "node:fs";
import path from "node:path";
import { openDb } from "../src/lib/db-core";
import { loadEnv } from "./env";

const FILE = path.join(process.cwd(), "content", "source", "수업준비", "에세이-아웃라인.md");

async function main() {
  loadEnv();
  if (!fs.existsSync(FILE)) {
    console.error(`No ${FILE}. Nothing to load.`);
    process.exit(1);
  }
  const text = fs.readFileSync(FILE, "utf8");
  const blocks = text.split(/^## +/m).slice(1);
  if (!blocks.length) {
    console.error("No '## <question id>' headings in the file.");
    process.exit(1);
  }
  const db = await openDb();
  const now = new Date().toISOString();
  let loaded = 0;
  for (const block of blocks) {
    const [head, ...rest] = block.split("\n");
    const id = head!.trim();
    const outline = rest.join("\n").trim();
    const known = await db.one<{ id: string }>("SELECT id FROM questions WHERE id = ?", id);
    if (!known) {
      console.error(`  ? ${id} — no such question, skipped`);
      continue;
    }
    await db.run(
      `INSERT INTO essay_outlines (question_id, outline, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (question_id) DO UPDATE SET outline = excluded.outline, updated_at = excluded.updated_at`,
      id,
      outline,
      now,
    );
    console.log(`  ✓ ${id} · ${outline.length} chars`);
    loaded++;
  }
  console.log(`\n${loaded} ${loaded === 1 ? "outline" : "outlines"} loaded into ${db.kind === "postgres" ? "Supabase" : "the local database"}.`);
  await db.close();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
