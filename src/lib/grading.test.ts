import { describe, expect, it } from "vitest";
import {
  checkCalculation,
  flagsFor,
  helpCategory,
  hintCap,
  parseNumber,
  scoreChain,
  withinTolerance,
} from "./grading";

describe("parseNumber", () => {
  it("reads signs, separators and units", () => {
    expect(parseNumber("−12")).toBe(-12);
    expect(parseNumber("US$ -2 billion")).toBe(-2);
    expect(parseNumber("4,480")).toBe(4480);
    expect(parseNumber("10 528")).toBe(10528);
    expect(parseNumber("12.5%")).toBe(12.5);
    expect(parseNumber("abc")).toBeNull();
  });
});

describe("calculation", () => {
  it("accepts answers within tolerance", () => {
    expect(withinTolerance(12.5, 12.5)).toBe(true);
    expect(withinTolerance(12.51, 12.5, 0.01)).toBe(true);
    expect(withinTolerance(12.6, 12.5, 0.01)).toBe(false);
  });
  it("checks every part", () => {
    const parts = [
      { label: "(a)", value: -12 },
      { label: "(b)", value: -2 },
    ];
    expect(checkCalculation(parts, ["-12", "-2"]).correct).toBe(true);
    expect(checkCalculation(parts, ["-12", "2"])).toEqual({ correct: false, partCorrect: [true, false] });
  });
});

describe("analysis chain", () => {
  const answer = ["s1", "s2", "s3", "s4"];
  it("gives full marks for the exact order", () => {
    expect(scoreChain(answer, answer, 3)).toEqual({ correct: true, marks: 3 });
  });
  it("gives credit per correct adjacent pair", () => {
    expect(scoreChain(answer, ["s1", "s2", "s4", "s3"], 3)).toEqual({ correct: false, marks: 1 });
    expect(scoreChain(answer, ["s1", "s2", "s3", "x1", "s4"], 3)).toEqual({ correct: false, marks: 2 });
  });
});

describe("help and flags", () => {
  it("caps by hint level", () => {
    expect([hintCap(0), hintCap(1), hintCap(2)]).toEqual([1, 0.9, 0.7]);
  });
  it("flags large pastes and long time away", () => {
    expect(flagsFor(39, 59_000)).toEqual([]);
    expect(flagsFor(40, 60_000)).toEqual(["paste", "tab_away"]);
  });
  it("sorts questions into help categories", () => {
    expect(helpCategory(0, 0, [])).toBe("without_ai");
    expect(helpCategory(1, 0, [])).toBe("with_ai");
    expect(helpCategory(0, 2, ["paste"])).toBe("with_ai");
    expect(helpCategory(0, 0, ["paste"])).toBe("unverified");
  });
});
