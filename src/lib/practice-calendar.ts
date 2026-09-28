import "server-only";
import { bankParts } from "./admin";
import { all } from "./db";
import { dateInSG } from "./due";
import { getSchedule, singaporeToday, upcomingSends } from "./schedule";
import type { CalendarCell } from "@/components/tutor/PracticeCalendar";

const DAY_MS = 86_400_000;
const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
/** The Monday on or before this date, the way the grid starts its weeks. */
const mondayOf = (d: Date) => new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY_MS);

/** The month a date falls in, as YYYY-MM, and the months either side of it. */
export const monthOf = (date: string) => date.slice(0, 7);
export function monthStep(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + by, 1));
  return iso(d).slice(0, 7);
}

/**
 * The whole weeks that cover a month: from the Monday on or before the 1st to the Sunday on or
 * after the last day, so the grid is always a round number of weeks.
 */
export function monthGrid(month: string): { start: Date; length: number } {
  const first = utc(`${month}-01`);
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
  const start = mondayOf(first);
  const end = new Date(last.getTime() + (6 - ((last.getUTCDay() + 6) % 7)) * DAY_MS); // the Sunday on or after
  return { start, length: Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1 };
}

/**
 * One month of practice for the calendar: whole weeks covering the month, what went out on each
 * day, and what the schedule will still send. Any month can be asked for, back or forward.
 */
export async function practiceMonth(studentId: string, month?: string) {
  const { date: today } = singaporeToday();
  const shown = /^\d{4}-\d{2}$/.test(month ?? "") ? month! : monthOf(today);
  const { start, length } = monthGrid(shown);
  const first = utc(`${shown}-01`);
  const end = new Date(start.getTime() + (length - 1) * DAY_MS);

  const [schedule, parts] = await Promise.all([getSchedule(studentId), bankParts()]);
  const units = parts.flatMap((p) => p.units);
  // upcomingSends counts from today, so ask for enough days to reach the end of this grid.
  const reach = Math.ceil((end.getTime() - utc(today).getTime()) / DAY_MS) + 1;
  const plannedByDate = new Map<string, ReturnType<typeof upcomingSends>>();
  if (schedule.enabled && reach > 0) {
    for (const u of upcomingSends(schedule, Math.min(reach, 400))) {
      if (u.date >= iso(start) && u.date <= iso(end)) plannedByDate.set(u.date, [...(plannedByDate.get(u.date) ?? []), u]);
    }
  }

  const sentRows = await all<{ id: string; at: string; title: string; status: string; n: number; units: string | null }>(
    `SELECT a.id, a.assigned_at AS at, s.title, a.status,
            (SELECT COUNT(*)::int FROM set_items i WHERE i.set_id = s.id) AS n,
            (SELECT string_agg(DISTINCT u.number::text, ',' ORDER BY u.number::text)
               FROM set_items i JOIN questions q ON q.id = i.question_id JOIN units u ON u.id = q.unit_id
              WHERE i.set_id = s.id) AS units
       FROM assignments a JOIN sets s ON s.id = a.set_id
      WHERE a.student_id = ? AND s.title LIKE 'Daily practice%'`,
    studentId,
  );
  const sgTime = (at: string) => new Date(new Date(at).getTime() + 8 * 3600_000).toISOString().slice(11, 16);
  const sentByDate = new Map<string, CalendarCell["sent"]>();
  for (const r of sentRows) {
    const on = dateInSG(r.at);
    if (on < iso(start) || on > iso(end)) continue;
    sentByDate.set(on, [
      ...(sentByDate.get(on) ?? []),
      {
        id: r.id,
        title: r.title,
        status: r.status,
        time: sgTime(r.at),
        count: r.n,
        short: r.units ? `U${r.units.split(",").join("/")}` : "All",
        done: r.status === "submitted" || r.status === "reviewed",
      },
    ]);
  }

  const unitName = (n: number | null) => (n === null ? "Every unit" : `Unit ${n} · ${units.find((u) => u.number === n)?.title ?? ""}`);
  const cells: CalendarCell[] = Array.from({ length }, (_, i) => {
    const d = new Date(start.getTime() + i * DAY_MS);
    const on = iso(d);
    return {
      date: on,
      day: d.getUTCDate(),
      today: on === today,
      past: on < today,
      // Days either side of the month are shown so the weeks are whole, but greyed.
      outside: monthOf(on) !== shown,
      sent: (sentByDate.get(on) ?? []).sort((a, b) => a.time.localeCompare(b.time)),
      planned: (plannedByDate.get(on) ?? []).map((p) => ({
        time: p.time,
        short: p.unit === null ? "All" : `U${p.unit}`,
        unitLabel: unitName(p.unit),
        unit: p.unit,
        count: p.count,
        byHand: p.source === "override",
      })),
    };
  });

  return {
    cells,
    month: shown,
    monthLabel: first.toLocaleDateString("en-SG", { month: "long", year: "numeric", timeZone: "UTC" }),
    thisMonth: monthOf(today),
  };
}
