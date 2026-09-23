import "server-only";
import { openDb, type Db, type Params, type Queryable } from "./db-core";

export { json, NOW_SQL } from "./db-core";
export type { Queryable } from "./db-core";

const g = globalThis as unknown as { onsideDb?: Promise<Db> };

// One connection pool per server instance (and across hot reloads in dev).
export function db(): Promise<Db> {
  if (!g.onsideDb) {
    g.onsideDb = openDb().catch((e) => {
      g.onsideDb = undefined;
      throw e;
    });
  }
  return g.onsideDb;
}

export const all = async <T = Record<string, unknown>>(sql: string, ...params: Params) => (await db()).all<T>(sql, ...params);
export const one = async <T = Record<string, unknown>>(sql: string, ...params: Params) => (await db()).one<T>(sql, ...params);
export const run = async (sql: string, ...params: Params) => (await db()).run(sql, ...params);
export const tx = async <T>(fn: (q: Queryable) => Promise<T>) => (await db()).tx(fn);
