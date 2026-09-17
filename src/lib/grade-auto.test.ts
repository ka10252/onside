import { describe, expect, it } from "vitest";
import type { Question } from "./content";
import { hasAnswer } from "./answered";
import { gradeAuto } from "./student";

const mcq = {
  id: "q1",
  format: "mcq",
  marks: 1,
  answer: "b",
  options: [
    { id: "a", text: "A", misconception: "mixes up demand and supply" },
    { id: "b", text: "B" },
  ],
} as unknown as Question;

const chain = { id: "q2", format: "analysis_chain", marks: 3, answer: ["s1", "s2", "s3", "s4"], steps: [] } as unknown as Question;

describe("gradeAuto (checked once, on submit)", () => {
  it("marks MCQ once and keeps the misconception", () => {
    expect(gradeAuto(mcq, ["b"])).toMatchObject({ correct: true, marks: 1 });
    expect(gradeAuto(mcq, ["a"])).toMatchObject({ correct: false, marks: 0, misconception: "mixes up demand and supply" });
  });

  it("gives chain credit per correct pair", () => {
    expect(gradeAuto(chain, ["s1", "s2", "s3", "s4"])).toMatchObject({ correct: true, marks: 3 });
    expect(gradeAuto(chain, ["s1", "s2", "s4", "s3"])).toMatchObject({ correct: false, marks: 1 });
  });

  it("checks calculation values without giving marks (the tutor marks working)", () => {
    const calc = { id: "q3", format: "calculation", marks: 2, answer: { value: 12.5, unit: "%" } } as unknown as Question;
    expect(gradeAuto(calc, ["12.5%"])).toMatchObject({ correct: true, marks: null });
    expect(gradeAuto(calc, ["13"])).toMatchObject({ correct: false });
  });

  it("leaves written questions to marking", () => {
    expect(gradeAuto({ id: "q4", format: "short_answer" } as unknown as Question, ["x"])).toBeNull();
  });
});

describe("hasAnswer", () => {
  const empty = { submitted_at: null, final_text: null, working_text: null, plan_text: null, photo_path: null, answers: null };
  it("is false for an empty or cleared response", () => {
    expect(hasAnswer(empty)).toBe(false);
    expect(hasAnswer({ ...empty, final_text: "", plan_text: "" })).toBe(false);
  });
  it("is true once something is chosen or typed", () => {
    expect(hasAnswer({ ...empty, answers: '["c"]' })).toBe(true);
    expect(hasAnswer({ ...empty, working_text: "PED = ..." })).toBe(true);
  });
});
