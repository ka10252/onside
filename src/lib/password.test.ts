import { describe, expect, it } from "vitest";
import { checkLogin, hashPassword, tokenHash, verifyPassword } from "./password";

describe("passwords", () => {
  it("verifies the right password only", () => {
    const h = hashPassword("1004**");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(h).not.toContain("1004");
    expect(verifyPassword("1004**", h)).toBe(true);
    expect(verifyPassword("1004*", h)).toBe(false);
    expect(verifyPassword("anything", null)).toBe(false);
  });
  it("salts every hash", () => {
    expect(hashPassword("2026")).not.toBe(hashPassword("2026"));
  });
  it("checks login ids and passwords", () => {
    expect(checkLogin("gildong", "2026")).toBeNull();
    expect(checkLogin("do", "2026")).not.toBeNull();
    expect(checkLogin("홍길동", "2026")).not.toBeNull();
    expect(checkLogin("gildong", "123")).not.toBeNull();
    expect(checkLogin("gildong", null)).toBeNull();
  });
  it("hashes tokens", () => {
    expect(tokenHash("abc")).toHaveLength(64);
  });
});
