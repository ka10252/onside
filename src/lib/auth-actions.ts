"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { one, run } from "./db";
import { newToken, tokenHash, verifyPassword } from "./password";
import { homeFor, SESSION_COOKIE, SESSION_DAYS, type User } from "./session";

export type SignInState = { error?: string; username?: string };

// Slow down guessing: 5 wrong tries on one login ID locks it for 5 minutes.
const WRONG = "Login ID or password is wrong.";
const LOCK_MS = 5 * 60_000;

export async function signIn(_prev: SignInState, fd: FormData): Promise<SignInState> {
  const username = String(fd.get("username") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!username || !password) return { error: "Enter your login ID and password.", username };

  const now = new Date().toISOString();
  const f = await one<{ count: number; locked_until: string | null }>("SELECT count, locked_until FROM login_failures WHERE username = ?", username);
  if (f?.locked_until && f.locked_until > now) return { error: "Too many tries. Wait 5 minutes and try again.", username };

  const user = await one<Pick<User, "id" | "role"> & { password_hash: string | null }>(
    "SELECT id, role, password_hash FROM users WHERE lower(username) = ? AND archived_at IS NULL",
    username,
  );
  // Hash even when the user doesn't exist, so timing doesn't reveal valid IDs.
  const ok = verifyPassword(password, user?.password_hash ?? "scrypt$00$00");
  if (!user || !ok) {
    const n = (f?.locked_until ? 0 : (f?.count ?? 0)) + 1;
    await run(
      `INSERT INTO login_failures (username, count, locked_until) VALUES (?, ?, ?)
       ON CONFLICT (username) DO UPDATE SET count = excluded.count, locked_until = excluded.locked_until`,
      username,
      n >= 5 ? 0 : n,
      n >= 5 ? new Date(Date.now() + LOCK_MS).toISOString() : null,
    );
    return { error: WRONG, username };
  }
  await run("DELETE FROM login_failures WHERE username = ?", username);

  const token = newToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await run("DELETE FROM sessions WHERE expires_at < ?", now);
  await run("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", tokenHash(token), user.id, expires.toISOString());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires,
    secure: process.env.NODE_ENV === "production",
  });
  redirect(homeFor(user));
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await run("DELETE FROM sessions WHERE token_hash = ?", tokenHash(token));
  jar.delete(SESSION_COOKIE);
  redirect("/");
}
