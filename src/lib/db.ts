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

/**
 * Vercel freezes an instance between requests and the database closes the connection it was
 * holding. When that instance wakes, a query goes out on a socket nobody is listening to and the
 * answer never comes: the page waits until the function's own time limit and the browser is told
 * something went wrong. Nothing in the driver notices, because no error ever arrives.
 *
 * So every query gets a deadline. Past it the pool is thrown away, which makes the next call open
 * a fresh one. Reads are simply asked again; writes are not, because a write that timed out may
 * still have reached the database.
 */
const QUERY_MS = 8000;

class QueryStalled extends Error {}

async function deadline<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new QueryStalled(`the database did not answer within ${QUERY_MS / 1000}s`)), QUERY_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Drops the pool this promise belongs to, unless something else already replaced it. */
async function dropPool(held: Promise<Db>) {
  if (g.onsideDb === held) g.onsideDb = undefined;
  try {
    await (await held).close();
  } catch {
    // it is already broken; closing is only tidiness
  }
}

async function ask<T>(work: (d: Db) => Promise<T>, retry: boolean): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const held = db();
    const conn = await held;
    if (conn.kind !== "postgres") return work(conn); // the local database is in this process
    try {
      return await deadline(work(conn));
    } catch (e) {
      if (!(e instanceof QueryStalled)) throw e;
      console.error(`database: query stalled on attempt ${attempt}, opening a new connection`);
      void dropPool(held);
      if (!retry || attempt === 2) throw e;
    }
  }
}

export const all = <T = Record<string, unknown>>(sql: string, ...params: Params) => ask((d) => d.all<T>(sql, ...params), true);
export const one = <T = Record<string, unknown>>(sql: string, ...params: Params) => ask((d) => d.one<T>(sql, ...params), true);
export const run = (sql: string, ...params: Params) => ask((d) => d.run(sql, ...params), false);
export const tx = <T>(fn: (q: Queryable) => Promise<T>) => ask((d) => d.tx(fn), false);
