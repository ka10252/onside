"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

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

/**
 * A small calendar that stays in the corner while the student scrolls: what arrived, what is due,
 * and what is on its way. Clicking a day shows that day underneath.
 */
export function AssignmentCalendar({ cells, monthLabel }: { cells: StudentDay[]; monthLabel: string }) {
  const [picked, setPicked] = useState<string | null>(null);
  // Whether it was left open, read the way the server can agree with.
  const stored = useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return localStorage.getItem("onside:calendar");
      } catch {
        return null;
      }
    },
    () => null,
  );
  const [choice, setChoice] = useState<boolean | null>(null);
  const open = choice ?? stored !== "closed";

  const toggle = () => {
    try {
      localStorage.setItem("onside:calendar", open ? "closed" : "open");
    } catch {
      // private window: it just won't be remembered
    }
    setChoice(!open);
  };

  const weeks: StudentDay[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const day = cells.find((c) => c.date === picked) ?? null;
  const dueLeft = (c: StudentDay) => c.due.filter((d) => !d.done);

  return (
    <aside className={`minical${open ? "" : " shut"}`} aria-label="Your calendar">
      <div className="mhead">
        <span>{open ? monthLabel : "Calendar"}</span>
        <button type="button" className="link" onClick={toggle} aria-expanded={open}>
          {open ? "Hide" : "Show"}
        </button>
      </div>
      {open && (
        <>
          <div className="mgrid">
            {DAYS.map((d, i) => (
              <span key={i} className="mdow">
                {d}
              </span>
            ))}
            {weeks.flatMap((week) =>
              week.map((c) => {
                const marks = [
                  ...c.arrived.map((a) => (a.done ? "done" : "waiting")),
                  ...dueLeft(c).map((d) => (d.late ? "late" : "due")),
                  ...c.coming.map(() => "coming"),
                ].slice(0, 3);
                const label = [
                  ...c.arrived.map((a) => `${a.title}${a.done ? " (finished)" : ""}`),
                  ...dueLeft(c).map((d) => `Due: ${d.title}`),
                  ...c.coming.map((p) => `${p.time}: ${p.unit === null ? "new set" : `unit ${p.unit}`}`),
                ].join(" · ");
                return (
                  <button
                    type="button"
                    key={c.date}
                    title={label || undefined}
                    onClick={() => setPicked(picked === c.date ? null : c.date)}
                    className={`mday${c.today ? " today" : ""}${picked === c.date ? " picked" : ""}${marks.length ? "" : " empty"}`}
                  >
                    <span>{c.day}</span>
                    <span className="dots">
                      {marks.map((m, i) => (
                        <i key={i} className={m} />
                      ))}
                    </span>
                  </button>
                );
              }),
            )}
          </div>

          {day && (
            <div className="mday-detail">
              <b>{new Date(day.date).toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</b>
              {day.arrived.length === 0 && dueLeft(day).length === 0 && day.coming.length === 0 && <p className="muted">Nothing this day.</p>}
              {day.arrived.map((a) => (
                <Link key={`a${a.id}`} href={a.done ? `/student/a/${a.id}/done` : `/student/a/${a.id}`}>
                  <i className={a.done ? "done" : "waiting"} /> {a.title}
                </Link>
              ))}
              {dueLeft(day).map((d) => (
                <Link key={`d${d.id}`} href={`/student/a/${d.id}`}>
                  <i className={d.late ? "late" : "due"} /> Due{d.time ? ` ${d.time}` : ""} · {d.title}
                </Link>
              ))}
              {day.coming.map((p) => (
                <span key={`p${p.time}`}>
                  <i className="coming" /> {p.time} · {p.unit === null ? "New set" : `Unit ${p.unit}`} · {p.count} questions
                </span>
              ))}
            </div>
          )}

          <p className="mkey">
            <i className="waiting" /> to do <i className="done" /> finished <i className="due" /> due <i className="coming" /> coming
          </p>
        </>
      )}
    </aside>
  );
}
