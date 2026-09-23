// Checks that the Supabase settings in .env.local are filled in and work. Prints no secrets.
//   npm run db:check
import { openDb } from "../src/lib/db-core";
import { loadEnv } from "./env";

const ok = (s: string) => console.log(`  ok   ${s}`);
const bad = (s: string) => {
  console.log(`  FAIL ${s}`);
  failed = true;
};
let failed = false;

async function main() {
  loadEnv();
  const url = process.env.DATABASE_URL ?? "";
  const api = process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  console.log("Settings in .env.local");
  if (!url) bad("DATABASE_URL is empty");
  else if (!/^postgres(ql)?:\/\//.test(url)) bad("DATABASE_URL should start with postgresql://");
  else if (url.includes("[YOUR-PASSWORD]") || url.includes("[")) bad("DATABASE_URL still has the [YOUR-PASSWORD] placeholder");
  else if (!url.includes(":6543/")) bad("DATABASE_URL is not the transaction pooler (port 6543)");
  else ok(`DATABASE_URL (${new URL(url).hostname}, port 6543)`);

  if (!api) bad("SUPABASE_URL is empty");
  else if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(api)) bad("SUPABASE_URL should look like https://xxxx.supabase.co");
  else ok(`SUPABASE_URL (${new URL(api).hostname})`);

  if (!key) bad("SUPABASE_SERVICE_ROLE_KEY is empty");
  else if (/^sb_publishable_/.test(key) || key.includes("anon")) bad("that looks like the public key — use service_role or a secret key");
  else ok(`SUPABASE_SERVICE_ROLE_KEY (${key.slice(0, 11)}…, ${key.length} characters)`);

  if (url && api) {
    const ref = new URL(api).hostname.split(".")[0]!;
    if (!url.includes(ref)) bad(`the two do not match: SUPABASE_URL is for project ${ref}`);
    else ok("both point at the same project");
  }
  if (failed) return;

  console.log("Connecting");
  const db = await openDb();
  const t = await db.one<{ n: number }>("SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'");
  ok(`database reachable (${t?.n ?? 0} tables so far)`);
  await db.close();

  const res = await fetch(`${api.replace(/\/$/, "")}/storage/v1/bucket`, {
    headers: { Authorization: `Bearer ${key}`, apikey: key },
  });
  if (res.ok) {
    const buckets = (await res.json()) as { name: string }[];
    ok(`storage reachable (buckets: ${buckets.map((b) => b.name).join(", ") || "none yet"})`);
  } else {
    bad(`storage says ${res.status} — check SUPABASE_SERVICE_ROLE_KEY`);
  }
}

main()
  .then(() => {
    console.log(failed ? "\nSomething needs fixing." : "\nAll good.");
    process.exit(failed ? 1 : 0);
  })
  .catch((e) => {
    console.error("\nFAIL", e instanceof Error ? e.message : e);
    process.exit(1);
  });
