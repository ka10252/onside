import { describe, expect, it } from "vitest";
import { conceptStatus, scoreSet, weakSpot, type ScoredQuestion } from "./scoring";

const q = (over: Partial<ScoredQuestion>): ScoredQuestion => ({
  id: "q",
  marks: 4,
  hintLevel: 0,
  aiQuestions: 0,
  flags: [],
  confirmed: 4,
  concepts: [{ key: "c1", label: "Exchange rates" }],
  ...over,
});

describe("scoreSet", () => {
  it("computes supported and independent scores", () => {
    const s = scoreSet([
      q({ id: "a", confirmed: 4 }), // without AI, 4
      q({ id: "b", confirmed: 4, hintLevel: 1 }), // with AI, 4 × 0.9
      q({ id: "c", confirmed: 2, flags: ["paste"] }), // unverified, 2
    ]);
    expect(s.total).toBe(12);
    expect(s.supported).toBeCloseTo((4 + 3.6 + 2) / 12);
    expect(s.independent).toBeCloseTo(4 / 12);
    expect([s.withoutAi, s.withAi, s.unverified]).toEqual([1, 1, 1]);
  });
  it("stays pending until every question is confirmed", () => {
    const s = scoreSet([q({}), q({ confirmed: null })]);
    expect(s.pending).toBe(1);
    expect(s.supported).toBeNull();
  });
  it("does not count blank questions as solved without AI", () => {
    const s = scoreSet([q({}), q({ answered: false, confirmed: 0 })]);
    expect([s.withoutAi, s.noAnswer]).toEqual([1, 1]);
    expect(s.independent).toBeCloseTo(0.5);
  });
  it("applies the Hint 2 cap", () => {
    expect(scoreSet([q({ hintLevel: 2, confirmed: 4 })]).supported).toBeCloseTo(0.7);
  });
});

describe("conceptStatus", () => {
  it("marks Solid, Shaky and Needs work", () => {
    const rows = conceptStatus([
      q({ concepts: [{ key: "solid", label: "S" }] }),
      q({ concepts: [{ key: "shaky", label: "H" }], hintLevel: 1 }),
      q({ concepts: [{ key: "needs", label: "N" }], confirmed: 1 }),
      q({ concepts: [{ key: "again", label: "A" }], aiQuestions: 2, confirmed: 3 }),
    ]);
    const by = Object.fromEntries(rows.map((r) => [r.key, r.status]));
    expect(by).toEqual({ solid: "solid", shaky: "shaky", needs: "needs", again: "needs" });
    expect(weakSpot(rows)?.key).toBe("needs");
  });
});
