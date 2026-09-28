import { describe, expect, it } from "vitest";
import { monthGrid, monthOf, monthStep } from "./practice-calendar";

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("monthStep", () => {
  it("walks back and forward over the turn of the year", () => {
    expect(monthStep("2026-01", -1)).toBe("2025-12");
    expect(monthStep("2026-12", 1)).toBe("2027-01");
    expect(monthStep("2026-09", 0)).toBe("2026-09");
    expect(monthStep("2026-09", -6)).toBe("2026-03");
  });
  it("reads the month off a date", () => {
    expect(monthOf("2026-09-28")).toBe("2026-09");
  });
});

describe("monthGrid", () => {
  const months = ["2026-01", "2026-02", "2026-03", "2026-08", "2026-09", "2026-11", "2027-02", "2028-02"];
  it("covers whole weeks that start on a Monday", () => {
    for (const m of months) {
      const { start, length } = monthGrid(m);
      expect(length % 7, m).toBe(0);
      expect(start.getUTCDay(), m).toBe(1); // Monday
    }
  });
  it("holds every day of the month and no whole week more", () => {
    for (const m of months) {
      const { start, length } = monthGrid(m);
      const end = new Date(start.getTime() + (length - 1) * 86_400_000);
      const first = new Date(`${m}-01T00:00:00Z`);
      const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
      expect(iso(start) <= iso(first), m).toBe(true);
      expect(iso(end) >= iso(last), m).toBe(true);
      expect(length - Math.round((last.getTime() - first.getTime()) / 86_400_000) - 1, m).toBeLessThan(14);
    }
  });
  it("gives February 2027 exactly four weeks", () => {
    // 1 Feb 2027 is a Monday and the month has 28 days, so the weeks line up.
    expect(monthGrid("2027-02")).toMatchObject({ length: 28 });
    expect(iso(monthGrid("2027-02").start)).toBe("2027-02-01");
  });
});
