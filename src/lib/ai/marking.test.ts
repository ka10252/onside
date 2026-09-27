import { describe, expect, it } from "vitest";
import { finish, type Raw } from "./marking";
import type { Question } from "../content";

// No API calls here: finish() is the pure part, where the model's JSON becomes what the tutor sees.
const q = { id: "q1", marks: 4, format: "short_answer", prompt: "Explain one barrier to entry." } as unknown as Question;
const answer = "A patent stops other firms copying the product, so they cannot enter the market.";
const raw = (over: Partial<Raw> = {}): Raw => ({ marks: 3, ...over });

describe("finish", () => {
  it("keeps the comment written for the student", () => {
    const m = finish(q, answer, raw({ comment_for_student: "  You named a patent and said what it does. \n" }));
    expect(m.comment).toBe("You named a patent and said what it does.");
  });
  it("has no comment when the model didn't write one", () => {
    expect(finish(q, answer, raw()).comment).toBeUndefined();
  });
  it("cuts a comment that runs on", () => {
    expect(finish(q, answer, raw({ comment_for_student: "x".repeat(900) })).comment).toHaveLength(500);
  });
  it("holds the marks inside what the question is worth", () => {
    expect(finish(q, answer, raw({ marks: 9 })).marks).toBe(4);
    expect(finish(q, answer, raw({ marks: -2 })).marks).toBe(0);
  });
  it("drops evidence quoting words the student never wrote", () => {
    const m = finish(q, answer, {
      marks: 3,
      evidence: [
        { point: "Names a barrier", quote: "A patent stops other firms", met: true },
        { point: "Explains the effect", quote: "economies of scale shut them out", met: true },
      ],
    });
    expect(m.evidence?.map((e) => e.point)).toEqual(["Names a barrier"]);
  });
});
