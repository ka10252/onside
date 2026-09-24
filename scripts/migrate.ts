// Applies the schema (every statement is CREATE ... IF NOT EXISTS) to the configured database.
//   npm run db:migrate
import { openDb } from "../src/lib/db-core";
import { loadEnv } from "./env";


/** The local database is a single file opened by one process at a time. */
function warnIfServerRunning() {
  console.log("Note: stop `npm run dev:local` before this, and start it again after, or it keeps serving the old copy.");
}

async function main() {
  loadEnv();
  warnIfServerRunning();
  const db = await openDb({ migrate: true });
  console.log(`Schema applied to ${db.kind === "postgres" ? "Supabase" : "the local database"}.`);
  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
