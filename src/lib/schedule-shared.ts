// Shapes the tutor's form needs too, so they live outside the server-only module.

export type Schedule = {
  student_id: string;
  enabled: number;
  count: number;
  source: "test" | "past" | "mix";
  /** JSON array of unit numbers; empty means every unit. */
  units: string;
  helper: "on" | "off";
  /** JSON array of weekdays, 0 = Sunday. */
  days: string;
  /** "HH:MM" Singapore time: the first set of the day. */
  send_at: string;
  /** Every send time on a practice day, as JSON; empty means just `send_at`. */
  times: string;
  /** Times already sent, as JSON: {"2026-09-25": ["07:00"]}. */
  sent_slots: string;
  due_days: number | null;
  /** "HH:MM" Singapore time, or null for "end of the due day". */
  due_time: string | null;
  /** Units in order, repeats allowed (e.g. [1, 2, 2, 3]); empty means use `units`. */
  plan: string;
  /** Where the plan is up to. */
  plan_index: number;
  /** Days the tutor set by hand: {"2026-09-26": 3} for a unit, or "skip" for no set that day. */
  overrides: string;
  last_sent_on: string | null;
};

export const DEFAULT_SCHEDULE: Omit<Schedule, "student_id"> = {
  enabled: 0,
  count: 5,
  source: "test",
  units: "[]",
  helper: "on",
  days: "[1,2,3,4,5]",
  send_at: "07:00",
  times: "[]",
  sent_slots: "{}",
  due_days: 1,
  due_time: null,
  plan: "[]",
  plan_index: 0,
  overrides: "{}",
  last_sent_on: null,
};

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The unit each of the next few sends will cover. 0 means "every unit". */
export function planPreview(plan: number[], index: number, n = 5): number[] {
  if (plan.length === 0) return [];
  return Array.from({ length: n }, (_, i) => plan[(index + i) % plan.length]!);
}

/** The times a practice day sends at. */
export function timesOf(s: { send_at: string; times: string }): string[] {
  try {
    const list = (JSON.parse(s.times) as unknown[]).map(String).filter((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t));
    return list.length ? [...new Set(list)].sort() : [s.send_at];
  } catch {
    return [s.send_at];
  }
}
