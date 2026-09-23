// Create or update a login account (Supabase when DATABASE_URL is set, else the local database). Passwords are hashed; nothing is written to the repo.
//   npm run account -- --id ibecon --password '…' --tutor
//   npm run account -- --id gildong --password '…' --name 홍길동 [--class 'IB DP Year 2 · Economics HL']
//   npm run account -- --id gildong --password '…' --user stu_…   (add a login to an existing student)
import { randomBytes } from "node:crypto";
import { openDb } from "../src/lib/db-core";
import { loadEnv } from "./env";
import { checkLogin, hashPassword } from "../src/lib/password";

loadEnv();
const args = process.argv.slice(2);
const arg = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const username = (arg("id") ?? "").toLowerCase();
const password = arg("password") ?? "";
const tutor = args.includes("--tutor");
const name = arg("name");

const bad = checkLogin(username, password);
if (bad) {
  console.error(bad);
  process.exit(1);
}

async function main() {
const db = await openDb();
const hash = hashPassword(password);
if (tutor) {
  const other = await db.one("SELECT id FROM users WHERE lower(username) = ? AND id <> 'tutor-jin'", username);
  if (other) throw new Error("Login ID is used by another account");
  const changed = await db.run("UPDATE users SET username = ?, password_hash = ? WHERE id = 'tutor-jin'", username, hash);
  if (!changed) await db.run("INSERT INTO users (id, role, name, username, password_hash) VALUES ('tutor-jin', 'tutor', 'Jin', ?, ?)", username, hash);
  await db.run("DELETE FROM sessions WHERE user_id = 'tutor-jin'");
  console.log(`Tutor login set: ${username}`);
} else {
  const userId = arg("user");
  const existing = await db.one<{ id: string }>("SELECT id FROM users WHERE lower(username) = ?", username);
  if (userId) {
    if (existing && existing.id !== userId) throw new Error("Login ID is used by another account");
    const changed = await db.run("UPDATE users SET username = ?, password_hash = ? WHERE id = ? AND role = 'student'", username, hash, userId);
    if (!changed) throw new Error("No student with that id");
    await db.run("DELETE FROM sessions WHERE user_id = ?", userId);
    console.log(`Student login set: ${username}`);
  } else if (existing) {
    await db.run(
      "UPDATE users SET password_hash = ?, name = COALESCE(?, name), subtitle = COALESCE(?, subtitle) WHERE id = ?",
      hash,
      name ?? null,
      arg("class") ?? null,
      existing.id,
    );
    await db.run("DELETE FROM sessions WHERE user_id = ?", existing.id);
    console.log(`Student login updated: ${username}`);
  } else {
    if (!name) throw new Error("--name is required for a new student");
    await db.run(
      "INSERT INTO users (id, role, name, subtitle, username, password_hash) VALUES (?, 'student', ?, ?, ?, ?)",
      `stu_${randomBytes(6).toString("hex")}`,
      name,
      arg("class") ?? null,
      username,
      hash,
    );
    console.log(`Student created: ${name} (${username})`);
  }
}
await db.close();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
