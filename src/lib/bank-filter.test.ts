import { describe, expect, it } from "vitest";
import { EMPTY_FILTER, matches, pickRandom, skillOf, type BankItem } from "./bank-filter";

const item = (over: Partial<BankItem>): BankItem => ({
  id: "x",
  unit_number: 16,
  format: "short_answer",
  paper_style: null,
  command_term: "explain",
  marks: 4,
  prompt: "Explain something.",
  targets: "",
  source: "original",
  past_label: null,
  level: null,
  session: null,
  skill: null,
  ...over,
});

describe("matches", () => {
  const p2 = item({ id: "p2", source: "past", paper_style: "P2", level: "HLSL", session: "M24", skill: "definition", unit_number: 13 });
  const p1sl = item({ id: "p1", source: "past", paper_style: "P1(a)", level: "SL", session: "N22", skill: "extended response" });
  const onside = item({ id: "o", format: "mcq" });

  it("filters by several units and sources", () => {
    const f = { ...EMPTY_FILTER, units: [13, 16], sources: ["P2" as const, "onside" as const] };
    expect([p2, p1sl, onside].filter((q) => matches(q, f)).map((q) => q.id)).toEqual(["p2", "o"]);
  });
  it("treats HL/SL papers as both levels", () => {
    expect(matches(p2, { ...EMPTY_FILTER, level: "SL" })).toBe(true);
    expect(matches(p1sl, { ...EMPTY_FILTER, level: "HL" })).toBe(false);
  });
  it("filters by session range and skill", () => {
    expect(matches(p1sl, { ...EMPTY_FILTER, from: 2305 })).toBe(false);
    expect(matches(p1sl, { ...EMPTY_FILTER, from: 2211, to: 2211 })).toBe(true);
    expect(matches(p2, { ...EMPTY_FILTER, from: 2211, to: 2311 })).toBe(false);
    expect(matches(p2, { ...EMPTY_FILTER, from: 2405, to: 2405 })).toBe(true);
    expect(matches(onside, { ...EMPTY_FILTER, from: 2305 })).toBe(true);
    expect(skillOf(onside)).toBe("multiple choice");
    expect(matches(p2, { ...EMPTY_FILTER, skills: ["definition"] })).toBe(true);
    expect(matches(onside, { ...EMPTY_FILTER, formats: ["mcq", "essay"] })).toBe(true);
    expect(matches(p2, { ...EMPTY_FILTER, formats: ["mcq", "essay"] })).toBe(false);
  });
});

describe("sources", () => {
  it("keeps unit test questions apart from other Onside questions", () => {
    const t = item({ id: "t", source: "unit-test" });
    expect(matches(t, { ...EMPTY_FILTER, sources: ["test"] })).toBe(true);
    expect(matches(t, { ...EMPTY_FILTER, sources: ["onside"] })).toBe(false);
  });
});

describe("pickRandom", () => {
  const pool = [
    item({ id: "a1", unit_number: 1, prompt: "A1" }),
    item({ id: "a2", unit_number: 1, prompt: "A2" }),
    item({ id: "a3", unit_number: 1, prompt: "A3" }),
    item({ id: "b1", unit_number: 2, prompt: "B1" }),
    item({ id: "b1-tz2", unit_number: 2, prompt: "B1" }),
  ];
  it("spreads picks across units and skips repeats", () => {
    const picked = pickRandom(pool, 4, [], true, () => 0.3);
    expect(picked).toHaveLength(4);
    expect(picked.filter((q) => q.unit_number === 2)).toHaveLength(1);
    expect(new Set(picked.map((q) => q.prompt)).size).toBe(4);
  });
  it("never repeats what is already chosen", () => {
    const picked = pickRandom(pool, 10, [pool[0]!], false, () => 0.5);
    expect(picked.map((q) => q.id)).not.toContain("a1");
    expect(picked).toHaveLength(3);
  });
});
