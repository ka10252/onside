import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Passwords are stored as scrypt hashes: "scrypt$<salt hex>$<hash hex>". Pure, no DB.

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [kind, saltHex, hashHex] = stored.split("$");
  if (kind !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

export const newToken = () => randomBytes(32).toString("base64url");
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export const USERNAME_RE = /^[a-z0-9._-]{3,30}$/i;
export const MIN_PASSWORD = 4;

export function checkLogin(username: string, password: string | null): string | null {
  if (!USERNAME_RE.test(username)) return "Login ID: 3–30 letters, numbers, dots, dashes or underscores.";
  if (password !== null && password.length < MIN_PASSWORD) return `Password: at least ${MIN_PASSWORD} characters.`;
  if (password !== null && password.length > 200) return "Password is too long.";
  return null;
}
