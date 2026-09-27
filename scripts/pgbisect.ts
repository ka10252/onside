import { loadEnv } from "./env";
import postgres from "postgres";

async function trial(label: string, opts: Record<string, unknown>) {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, onnotice: () => {}, ...opts });
  const t = Date.now();
  try {
    await Promise.all(Array.from({ length: 9 }, () => sql.unsafe("SELECT 1")));
    console.log(`${String(Date.now() - t).padStart(6)} ms  ${label}`);
  } catch (e) {
    console.log(`  FAILED  ${label}: ${e instanceof Error ? e.message : e}`);
  }
  await sql.end({ timeout: 2 });
}

async function main() {
  loadEnv();
  await trial("max 2, idle 10, lifetime 300", { max: 2, idle_timeout: 10, max_lifetime: 60 * 5, connect_timeout: 10 });
  await trial("max 2, idle 10 (no lifetime)", { max: 2, idle_timeout: 10, connect_timeout: 10 });
  await trial("max 3, idle 20 (the old settings)", { max: 3, idle_timeout: 20, connect_timeout: 10 });
  await trial("max 5", { max: 5, connect_timeout: 10 });
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
