import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { tokenHash } from "./password";

// Sign-in with login ID and password (docs/decisions.md). The cookie holds a random session token.
export const SESSION_COOKIE = "onside_session";
export const SESSION_DAYS = 30;

export type User = { id: string; role: "tutor" | "student"; name: string; subtitle: string | null };

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return (
    (db()
      .prepare(
        `SELECT u.id, u.role, u.name, u.subtitle FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = ? AND s.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AND u.archived_at IS NULL`,
      )
      .get(tokenHash(token)) as User | undefined) ?? null
  );
}

export async function requireUser(role: User["role"]): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/");
  if (user.role !== role) redirect(homeFor(user));
  return user;
}

export function homeFor(user: Pick<User, "role">) {
  return user.role === "tutor" ? "/tutor" : "/student";
}
