// Deletes one student and everything of theirs (assignments, answers, events, sets made only for them).
// Content and other students are untouched. Shows what it will delete first.
//   npm run student:delete -- --id teststudent [--yes]
import { openDb } from "../src/lib/db-core";
import { loadEnv } from "./env";

async function main() {
  loadEnv();
  const args = process.argv.slice(2);
  const username = (args[args.indexOf("--id") + 1] ?? "").toLowerCase();
  if (!username || !args.includes("--id")) throw new Error("Use --id <login id>");
  const db = await openDb();
  console.log(db.kind === "postgres" ? "Supabase" : "local database");
  const user = await db.one<{ id: string; name: string }>("SELECT id, name FROM users WHERE lower(username) = ? AND role = 'student'", username);
  if (!user) throw new Error(`No student with login id ${username}`);

  const asg = await db.all<{ id: string; title: string; status: string }>(
    "SELECT a.id, s.title, a.status FROM assignments a JOIN sets s ON s.id = a.set_id WHERE a.student_id = ?",
    user.id,
  );
  // Sets made for this student only (review quizzes and one-off sets), never the ready-made unit tests.
  const sets = await db.all<{ id: string; title: string }>(
    `SELECT s.id, s.title FROM sets s WHERE s.preset IS NULL
       AND EXISTS (SELECT 1 FROM assignments a WHERE a.set_id = s.id AND a.student_id = ?)
       AND NOT EXISTS (SELECT 1 FROM assignments a WHERE a.set_id = s.id AND a.student_id <> ?)`,
    user.id,
    user.id,
  );
  console.log(`student: ${user.name} (${username})`);
  for (const a of asg) console.log(` assignment: ${a.status} · ${a.title.slice(0, 50)}`);
  for (const s of sets) console.log(` set: ${s.title.slice(0, 50)}`);
  if (!args.includes("--yes")) {
    console.log("\nNothing deleted. Add --yes to delete.");
    await db.close();
    return;
  }
  await db.tx(async (t) => {
    await t.run("DELETE FROM events WHERE response_id IN (SELECT id FROM responses WHERE student_id = ?)", user.id);
    await t.run("DELETE FROM responses WHERE student_id = ?", user.id);
    await t.run("DELETE FROM ai_batches WHERE assignment_id IN (SELECT id FROM assignments WHERE student_id = ?)", user.id);
    await t.run("DELETE FROM assignments WHERE student_id = ?", user.id);
    for (const s of sets) {
      await t.run("DELETE FROM set_items WHERE set_id = ?", s.id);
      await t.run("DELETE FROM sets WHERE id = ?", s.id);
    }
    await t.run("DELETE FROM sessions WHERE user_id = ?", user.id);
    await t.run("DELETE FROM users WHERE id = ?", user.id);
  });
  console.log("\nDeleted.");
  await db.close();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
