import { describe, expect, it } from "vitest";
import { duePieces, formatDue, isOverdue, shortDateSG, dateInSG } from "./due";

describe("due dates", () => {
  it("reads a date with or without a time", () => {
    expect(duePieces("2026-09-26")).toEqual({ date: "2026-09-26", time: null });
    expect(duePieces("2026-09-26T21:00")).toEqual({ date: "2026-09-26", time: "21:00" });
  });
  it("is late only after the time, or after the whole day", () => {
    const at = (iso: string) => new Date(iso);
    expect(isOverdue("2026-09-26T21:00", at("2026-09-26T12:59:00Z"))).toBe(false); // 20:59 in Singapore
    expect(isOverdue("2026-09-26T21:00", at("2026-09-26T13:01:00Z"))).toBe(true); // 21:01
    expect(isOverdue("2026-09-26", at("2026-09-26T15:00:00Z"))).toBe(false); // still the 26th there
    expect(isOverdue("2026-09-26", at("2026-09-26T16:01:00Z"))).toBe(true); // past midnight there
    expect(isOverdue(null)).toBe(false);
  });
  it("shows a date and a time", () => {
    expect(formatDue("2026-09-26")).toMatch(/26 Sep/);
    expect(formatDue("2026-09-26T21:00")).toMatch(/9:00/);
  });
});

describe("timestamps are read in Singapore", () => {
  it("keeps a 7am Singapore send on that day, not the day before", () => {
    const sentAt = "2026-09-25T23:00:00.000Z"; // 07:00 on the 26th in Singapore
    expect(dateInSG(sentAt)).toBe("2026-09-26");
    expect(shortDateSG(sentAt)).toMatch(/26 Sep/);
  });
});
