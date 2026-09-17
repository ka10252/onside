import "server-only";
import type Database from "better-sqlite3";
import { openDb } from "./db-core";

export { json } from "./db-core";

const globalForDb = globalThis as unknown as { onsideDb?: Database.Database };

// Reuse one connection across hot reloads in dev.
export function db(): Database.Database {
  if (!globalForDb.onsideDb) globalForDb.onsideDb = openDb();
  return globalForDb.onsideDb;
}
