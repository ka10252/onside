// Scripts: load .env.local like Next.js does (the app gets it from Next).
import path from "node:path";

/**
 * Without this, DATABASE_URL is unset and every script quietly writes to the local PGlite copy
 * instead of Supabase — which is how a session's worth of notes and outlines went to the wrong
 * database while each run reported success (Jin, 2026-10-14). So it fails loudly instead: on a Node
 * too old for process.loadEnvFile, and on an env file that is present but unreadable.
 */
export function loadEnv() {
  if (typeof process.loadEnvFile !== "function") {
    throw new Error(
      `Node ${process.version} cannot read .env.local: process.loadEnvFile arrived in Node 20.12. ` +
        `Use the version in .nvmrc (nvm use), or the scripts will write to the local database.`,
    );
  }
  let read = false;
  for (const f of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(path.join(process.cwd(), f));
      read = true;
    } catch (e) {
      // A missing file is normal; anything else means the file is there and broken.
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
  if (!read) console.warn("No .env.local or .env: this will use the local database, not Supabase.");
}
