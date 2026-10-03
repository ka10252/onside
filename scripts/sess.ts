import { openDb } from "../src/lib/db-core";
import { tokenHash } from "../src/lib/password";
import { loadEnv } from "./env";
async function main() { loadEnv(); const db = await openDb();
  const u = await db.one<{ id: string }>("SELECT id FROM users WHERE role = 'tutor' LIMIT 1");
  await db.run("DELETE FROM sessions WHERE token_hash = ?", tokenHash("view-tutor"));
  await db.run("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", tokenHash("view-tutor"), u!.id, new Date(Date.now() + 86_400_000).toISOString());
  await db.close(); console.log("ok"); }
main();
