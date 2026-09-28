import { describe, expect, it } from "vitest";
import { dueSlots, sendsOn, slotsForDate, upcomingSends } from "./schedule";
import { DEFAULT_SCHEDULE, type Schedule } from "./schedule-shared";

// Monday 5 October 2026. Weekday numbers are Sunday 0 … Saturday 6.
const MON = "2026-10-05";
const TUE = "2026-10-06";
const SAT = "2026-10-10";
const at = (date: string, time = "12:00") => new Date(`${date}T${time}:00+08:00`);

const sched = (over: Partial<Schedule> = {}): Schedule => ({
  student_id: "u1",
  ...DEFAULT_SCHEDULE,
  days: "[1,2,3,4,5]", // weekdays
  times: '["07:00"]',
  count: 5,
  ...over,
});

const byHand = (date: string, time = "18:00") => JSON.stringify({ [date]: [{ u: 7, n: 3, t: time }] });

describe("sendsOn", () => {
  it("sends on a weekday while the schedule is on", () => {
    expect(sendsOn(sched({ enabled: 1 }), MON)).toBe(true);
    expect(sendsOn(sched({ enabled: 1 }), SAT)).toBe(false);
  });
  it("sends nothing on the weekly days while the schedule is off", () => {
    expect(sendsOn(sched({ enabled: 0 }), MON)).toBe(false);
  });
  it("sends a day the tutor set by hand even with the schedule off", () => {
    const s = sched({ enabled: 0, overrides: byHand(SAT) });
    expect(sendsOn(s, SAT)).toBe(true);
    expect(slotsForDate(s, SAT).slots).toEqual([{ time: "18:00", unit: 7, count: 3, source: "override" }]);
  });
  it("honours a day set aside, whatever the switch says", () => {
    expect(sendsOn(sched({ enabled: 1, overrides: JSON.stringify({ [MON]: "skip" }) }), MON)).toBe(false);
  });
});

describe("dueSlots", () => {
  it("brings a hand-set day round when its time comes, with the schedule off", () => {
    const s = sched({ enabled: 0, overrides: byHand(SAT) });
    expect(dueSlots(s, SAT, "17:59")).toHaveLength(0);
    expect(dueSlots(s, SAT, "18:00")).toHaveLength(1);
  });
});

describe("upcomingSends", () => {
  it("lists only the hand-set days while the schedule is off", () => {
    const s = sched({ enabled: 0, overrides: byHand(TUE) });
    const out = upcomingSends(s, 14, at(MON, "06:00"));
    expect(out.map((u) => u.date)).toEqual([TUE]);
    expect(out[0]).toMatchObject({ time: "18:00", unit: 7, count: 3, source: "override" });
  });
  it("lists the weekly days once the schedule is on", () => {
    const out = upcomingSends(sched({ enabled: 1 }), 7, at(MON, "06:00"));
    expect(out.map((u) => u.date)).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"]);
  });
  it("does not move the rotation on for days that send nothing", () => {
    const s = sched({ enabled: 1, plan: "[1,2]", plan_index: 0 });
    const out = upcomingSends(s, 9, at(MON, "06:00"));
    // Five weekdays, then the weekend sends nothing, then Monday picks up where Friday left off.
    expect(out.map((u) => u.unit)).toEqual([1, 2, 1, 2, 1, 2, 1]);
  });
});

describe("sentTimes and what it blocks", () => {
  const s = (over: Partial<Schedule>) => sched({ enabled: 0, overrides: byHand(MON, "11:20"), ...over });

  it("does not treat a send-now as the morning set", () => {
    // "Send one now" records the date with no time. The 11:20 set must still go out.
    const now = s({ sent_slots: JSON.stringify({ [MON]: [] }), last_sent_on: MON });
    expect(dueSlots(now, MON, "11:20")).toHaveLength(1);
  });
  it("still reads a row from before the log existed", () => {
    const old = s({ sent_slots: "{}", last_sent_on: MON, send_at: "07:00" });
    expect(dueSlots(old, MON, "23:00")).toHaveLength(0);
  });
  it("does not send a slot twice", () => {
    const done = s({ sent_slots: JSON.stringify({ [MON]: ["11:20"] }), last_sent_on: MON });
    expect(dueSlots(done, MON, "23:00")).toHaveLength(0);
  });
});
