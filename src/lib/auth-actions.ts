"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { newToken, tokenHash, verifyPassword } from "./password";
import { homeFor, SESSION_COOKIE, SESSION_DAYS, type User } from "./session";

export type SignInState = { error?: string; username?: string };

// Slow down guessing: 5 wrong tries on one login ID locks it for 5 minutes (per server process).
const g = globalThis as unknown as { onsideFails?: Map<string, { n: number; until: number }> };
const fails = (g.onsideFails ??= new Map());
const WRONG = "Login ID or password is wrong.";

export async function signIn(_prev: SignInState, fd: FormData): Promise<SignInState> {
  const username = String(fd.get("username") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!username || !password) return { error: "Enter your login ID and password.", username };

  const f = fails.get(username);
  if (f && f.until > Date.now()) return { error: "Too many tries. Wait 5 minutes and try again.", username };

  const user = db()
    .prepare("SELECT id, role, password_hash FROM users WHERE username = ? COLLATE NOCASE AND archived_at IS NULL")
    .get(username) as (Pick<User, "id" | "role"> & { password_hash: string | null }) | undefined;
  // Hash even when the user doesn't exist, so timing doesn't reveal valid IDs.
  const ok = verifyPassword(password, user?.password_hash ?? "scrypt$00$00");
  if (!user || !ok) {
    const n = (f?.n ?? 0) + 1;
    fails.set(username, { n, until: n >= 5 ? Date.now() + 5 * 60_000 : 0 });
    return { error: WRONG, username };
  }
  fails.delete(username);

  const token = newToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  db().prepare("DELETE FROM sessions WHERE expires_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')").run();
  db()
    .prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .run(tokenHash(token), user.id, expires.toISOString());
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", expires });
  redirect(homeFor(user));
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) db().prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash(token));
  jar.delete(SESSION_COOKIE);
  redirect("/");
}
