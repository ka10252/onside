import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { one } from "./db";
import { tokenHash } from "./password";

// Sign-in with login ID and password (docs/decisions.md). The cookie holds a random session token.
export const SESSION_COOKIE = "onside_session";
export const SESSION_DAYS = 30;

export type User = { id: string; role: "tutor" | "student"; name: string; subtitle: string | null };

// Cached per request: layouts and pages both ask.
export const currentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return (
    (await one<User>(
      `SELECT u.id, u.role, u.name, u.subtitle FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > ? AND u.archived_at IS NULL`,
      tokenHash(token),
      new Date().toISOString(),
    )) ?? null
  );
});

export async function requireUser(role: User["role"]): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/");
  if (user.role !== role) redirect(homeFor(user));
  return user;
}

export function homeFor(user: Pick<User, "role">) {
  return user.role === "tutor" ? "/tutor" : "/student";
}
