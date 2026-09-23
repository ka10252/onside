import { describe, expect, it } from "vitest";
import { toPg } from "./db-core";

describe("toPg", () => {
  it("numbers placeholders in order", () => {
    expect(toPg("SELECT * FROM t WHERE a = ? AND b IN (?, ?)")).toBe("SELECT * FROM t WHERE a = $1 AND b IN ($2, $3)");
  });
  it("leaves question marks inside quotes alone", () => {
    expect(toPg(`SELECT '?' AS q, to_char(x, 'YYYY"T"HH') FROM t WHERE id = ?`)).toBe(
      `SELECT '?' AS q, to_char(x, 'YYYY"T"HH') FROM t WHERE id = $1`,
    );
  });
});
