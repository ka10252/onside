import { describe, expect, it } from "vitest";
import { rewriteOf } from "./rewrite";

const asked = {
  rewrite_note: "Name the marking point.",
  rewrite_asked_at: "2026-10-03T16:36:44.943Z",
};

describe("rewriteOf", () => {
  it("is nothing until a rewrite has been asked for", () => {
    expect(rewriteOf({ rewrite_text: "written anyway" })).toBeNull();
  });

  it("reads a rewrite the student has written but the tutor has not closed", () => {
    expect(rewriteOf({ ...asked, rewrite_text: "second version", rewrite_at: "2026-10-04T05:00:00.000Z" })).toMatchObject({
      text: "second version",
      doneAt: null,
    });
  });

  // Closing a rewrite used to clear rewrite_text, which threw away the student's work. A closed
  // rewrite keeps what they wrote; only doneAt is set.
  it("keeps what the student wrote after the tutor is done with it", () => {
    const r = rewriteOf({ ...asked, rewrite_text: "second version", rewrite_done_at: "2026-10-08T04:00:00.000Z" });
    expect(r?.text).toBe("second version");
    expect(r?.doneAt).toBe("2026-10-08T04:00:00.000Z");
  });
});
