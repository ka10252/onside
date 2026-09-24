import { describe, expect, it } from "vitest";
import { timesOf } from "./schedule-shared";
import { nextFreeTime } from "@/components/tutor/PracticeCalendar";

describe("timesOf", () => {
  it("falls back to the one send time", () => {
    expect(timesOf({ send_at: "07:00", times: "[]" })).toEqual(["07:00"]);
    expect(timesOf({ send_at: "07:00", times: "not json" })).toEqual(["07:00"]);
  });
  it("sorts, drops repeats and rejects nonsense", () => {
    expect(timesOf({ send_at: "07:00", times: '["20:00","07:00","20:00","26:00"]' })).toEqual(["07:00", "20:00"]);
  });
});

describe("nextFreeTime", () => {
  it("finds the next quarter hour after the last set", () => {
    expect(nextFreeTime(["07:00"])).toBe("07:15");
  });
  it("keeps going when that one is taken", () => {
    expect(nextFreeTime(["07:00", "07:15"])).toBe("07:30");
  });
  it("wraps round midnight instead of repeating a time", () => {
    const time = nextFreeTime(["23:45"]);
    expect(time).not.toBe("23:45");
    expect(time).toMatch(/^\d{2}:\d{2}$/);
  });
});
