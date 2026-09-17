// Create or update a login account in the local database. Passwords are hashed; nothing is written to the repo.
//   npm run account -- --id ibecon --password '…' --tutor
//   npm run account -- --id gildong --password '…' --name 홍길동 [--class 'IB DP Year 2 · Economics HL']
//   npm run account -- --id gildong --password '…' --user stu_…   (add a login to an existing student)
import { randomBytes } from "node:crypto";
import { openDb } from "../src/lib/db-core";
import { checkLogin, hashPassword } from "../src/lib/password";

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

const db = openDb();
const hash = hashPassword(password);
if (tutor) {
  const other = db.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id <> 'tutor-jin'").get(username);
  if (other) throw new Error("Login ID is used by another account");
  db.prepare("UPDATE users SET username = ?, password_hash = ? WHERE id = 'tutor-jin'").run(username, hash);
  db.prepare("DELETE FROM sessions WHERE user_id = 'tutor-jin'").run();
  console.log(`Tutor login set: ${username}`);
} else {
  const userId = arg("user");
  if (userId) {
    const taken = db.prepare("SELECT 1 FROM users WHERE username = ? COLLATE NOCASE AND id <> ?").get(username, userId);
    if (taken) throw new Error("Login ID is used by another account");
    const res = db.prepare("UPDATE users SET username = ?, password_hash = ? WHERE id = ? AND role = 'student'").run(username, hash, userId);
    if (!res.changes) throw new Error("No student with that id");
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
    console.log(`Student login set: ${username}`);
    db.close();
    process.exit(0);
  }
  const existing = db.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE").get(username) as { id: string } | undefined;
  if (existing) {
    db.prepare("UPDATE users SET password_hash = ?, name = COALESCE(?, name), subtitle = COALESCE(?, subtitle) WHERE id = ?")
      .run(hash, name ?? null, arg("class") ?? null, existing.id);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(existing.id);
    console.log(`Student login updated: ${username}`);
  } else {
    if (!name) throw new Error("--name is required for a new student");
    db.prepare("INSERT INTO users (id, role, name, subtitle, username, password_hash) VALUES (?, 'student', ?, ?, ?, ?)")
      .run(`stu_${randomBytes(6).toString("hex")}`, name, arg("class") ?? null, username, hash);
    console.log(`Student created: ${name} (${username})`);
  }
}
db.close();
