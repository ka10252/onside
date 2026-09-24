// Applies the schema (every statement is CREATE ... IF NOT EXISTS) to the configured database.
//   npm run db:migrate
import { openDb } from "../src/lib/db-core";
import { loadEnv } from "./env";

async function main() {
  loadEnv();
  const db = await openDb({ migrate: true });
  console.log(`Schema applied to ${db.kind === "postgres" ? "Supabase" : "the local database"}.`);
  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
