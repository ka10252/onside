import Link from "next/link";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type StudentDay = {
  date: string;
  day: number;
  today: boolean;
  /** Sets that arrived that day. */
  arrived: { id: string; title: string; done: boolean }[];
  /** Sets to finish by that day. */
  due: { id: string; title: string; time: string | null; late: boolean; done: boolean }[];
  /** Sets that will arrive that day. */
  coming: { time: string; unit: number | null; count: number }[];
};

/** Four weeks: what arrived, what is due, and what is on its way. */
export function AssignmentCalendar({ cells, monthLabel }: { cells: StudentDay[]; monthLabel: string }) {
  const weeks: StudentDay[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return (
    <section className="card">
      <div className="card-hd">
        <h2>{monthLabel}</h2>
        <span className="key">
          <span className="chip waiting">Arrived</span>
          <span className="chip done">Finished</span>
          <span className="chip duechip">Due</span>
          <span className="chip planned">On its way</span>
        </span>
      </div>
      <div className="calendar">
        <div className="calgrid">
          {DAYS.map((d) => (
            <span key={d} className="dow">
              {d}
            </span>
          ))}
          {weeks.flatMap((week) =>
            week.map((c) => (
              <div key={c.date} className={`cell readonly${c.today ? " today" : ""}`}>
                <span className="d">{c.day}</span>
                {c.arrived.map((a) => (
                  <Link key={`a${a.id}`} href={a.done ? `/student/a/${a.id}/done` : `/student/a/${a.id}`} className={`chip ${a.done ? "done" : "waiting"}`}>
                    {a.title}
                  </Link>
                ))}
                {c.due
                  .filter((d) => !d.done)
                  .map((d) => (
                    <Link key={`d${d.id}`} href={`/student/a/${d.id}`} className={`chip duechip${d.late ? " late" : ""}`}>
                      Due{d.time ? ` ${d.time}` : ""} · {d.title}
                    </Link>
                  ))}
                {c.coming.map((p) => (
                  <span key={`p${p.time}`} className="chip planned">
                    {p.time} · {p.unit === null ? "New set" : `Unit ${p.unit}`} · {p.count}
                  </span>
                ))}
              </div>
            )),
          )}
        </div>
      </div>
    </section>
  );
}
