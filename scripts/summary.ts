import { openDb } from "../src/lib/db-core";
import { loadEnv } from "./env";

async function main() {
  loadEnv();
  const db = await openDb();
  console.log(db.kind === "postgres" ? "Supabase" : "local");
  const counts = await db.all<{ n: string; c: number }>(
    `SELECT 'units' AS n, COUNT(*)::int AS c FROM units
     UNION ALL SELECT 'questions', COUNT(*)::int FROM questions
     UNION ALL SELECT 'past_questions (text)', COUNT(*)::int FROM past_questions
     UNION ALL SELECT 'sets', COUNT(*)::int FROM sets
     UNION ALL SELECT 'users', COUNT(*)::int FROM users
     UNION ALL SELECT 'assignments', COUNT(*)::int FROM assignments
     UNION ALL SELECT 'responses', COUNT(*)::int FROM responses
     UNION ALL SELECT 'events', COUNT(*)::int FROM events`,
  );
  console.log(counts.map((r) => `${r.n}=${r.c}`).join(" · "));
  for (const u of await db.all<{ name: string; username: string; role: string }>("SELECT name, username, role FROM users ORDER BY role, name")) {
    console.log(` user: ${u.name} (${u.username ?? "no login"}, ${u.role})`);
  }
  for (const a of await db.all<{ name: string; status: string; title: string }>(
    "SELECT u.name, a.status, s.title FROM assignments a JOIN users u ON u.id = a.student_id JOIN sets s ON s.id = a.set_id ORDER BY a.assigned_at",
  )) {
    console.log(` assignment: ${a.name} · ${a.status} · ${a.title.slice(0, 45)}`);
  }
  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
