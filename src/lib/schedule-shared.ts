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
  due_days: number | null;
  last_sent_on: string | null;
};

export const DEFAULT_SCHEDULE: Omit<Schedule, "student_id"> = {
  enabled: 0,
  count: 5,
  source: "test",
  units: "[]",
  helper: "on",
  days: "[1,2,3,4,5]",
  due_days: 1,
  last_sent_on: null,
};

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
