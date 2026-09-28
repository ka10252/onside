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
  it("splits marks into with help and without", () => {
    const s = scoreSet([
      q({ id: "a", confirmed: 4 }), // no help
      q({ id: "b", confirmed: 3, hintLevel: 1 }), // hint
      q({ id: "c", confirmed: 1, aiQuestions: 2 }), // asked the Helper
      q({ id: "d", confirmed: 2, flags: ["paste"] }), // no help, but flagged
      q({ id: "e", confirmed: 0, answered: false }), // blank
    ]);
    expect(s.split.withoutAi).toEqual({ got: 6, available: 8, questions: 2 });
    expect(s.split.withAi).toEqual({ got: 4, available: 8, questions: 2 });
    expect(s.split.withoutAi.got + s.split.withAi.got).toBe(s.marks);
  });
  it("counts the questions taken for full marks, with and without help", () => {
    const s = scoreSet([
      q({ id: "a", confirmed: 4 }), // full marks, no help
      q({ id: "b", confirmed: 4, hintLevel: 1 }), // full marks, used a hint
      q({ id: "c", confirmed: 3 }), // part marks, no help
      q({ id: "d", confirmed: 4, flags: ["paste"] }), // full marks, flagged but unhelped
      q({ id: "e", confirmed: 0, answered: false }), // blank
    ]);
    expect([s.solvedAlone, s.solved, s.count]).toEqual([2, 3, 5]);
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
