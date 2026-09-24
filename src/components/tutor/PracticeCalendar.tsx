const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type CalendarCell = {
  date: string;
  /** Day of the month. */
  day: number;
  today: boolean;
  /** A set that already went out that day. */
  sent?: { title: string; status: string } | null;
  /** A set the schedule will send that day. */
  planned?: { time: string; unitLabel: string; count: number } | null;
};

/** Four weeks of practice: what went out, and what is coming. */
export function PracticeCalendar({ cells, monthLabel }: { cells: CalendarCell[]; monthLabel: string }) {
  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return (
    <div className="calendar">
      <div className="calhead">
        <span className="month">{monthLabel}</span>
        <span className="key">
          <span className="dot planned" aria-hidden /> planned
          <span className="dot sent" aria-hidden /> sent
        </span>
      </div>
      <div className="calgrid">
        {DAYS.map((d) => (
          <span key={d} className="dow">
            {d}
          </span>
        ))}
        {weeks.flatMap((week) =>
          week.map((c) => (
            <div key={c.date} className={`cell${c.today ? " today" : ""}${c.planned || c.sent ? " has" : ""}`}>
              <span className="d">{c.day}</span>
              {c.sent && (
                <span className="chip sent" title={c.sent.title}>
                  Sent
                </span>
              )}
              {c.planned && (
                <span className="chip planned" title={`${c.planned.unitLabel} · ${c.planned.count} questions`}>
                  {c.planned.time} · {c.planned.unitLabel.replace(/ ·.*/, "")} · {c.planned.count}
                </span>
              )}
            </div>
          )),
        )}
      </div>
    </div>
  );
}
