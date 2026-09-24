// A due date is "2026-09-26", or "2026-09-26T21:00" when the tutor set a time of day.
// Times are Singapore time, where the tutor and the student are.

export const SG_OFFSET_MS = 8 * 3600_000;

export function duePieces(due: string) {
  const [date, time] = due.split("T");
  return { date: date!, time: time && /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : null };
}

/** "Fri 26 Sep" or "Fri 26 Sep, 9:00 pm". */
export function formatDue(due: string) {
  const { date, time } = duePieces(due);
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(y!, m! - 1, d!).toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short" });
  if (!time) return day;
  const [hh, mm] = time.split(":").map(Number);
  const clock = new Date(2000, 0, 1, hh!, mm!).toLocaleTimeString("en-SG", { hour: "numeric", minute: "2-digit" });
  return `${day}, ${clock}`;
}

/** Now, in Singapore, as "YYYY-MM-DDTHH:MM". */
export function singaporeNow(now = new Date()) {
  return new Date(now.getTime() + SG_OFFSET_MS).toISOString().slice(0, 16);
}

export function isOverdue(due: string | null, now = new Date()) {
  if (!due) return false;
  const { date, time } = duePieces(due);
  // A date with no time is late once that day has passed.
  return singaporeNow(now) > (time ? `${date}T${time}` : `${date}T23:59`);
}
