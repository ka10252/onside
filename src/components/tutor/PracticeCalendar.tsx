"use client";

import { useState, useTransition } from "react";
import { PreviewPanel, QuestionLine } from "@/components/QuestionPreview";
import { previewPracticeDay, setPracticeDay, type DayPreview } from "@/lib/schedule-actions";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type CalendarCell = {
  date: string;
  /** Day of the month. */
  day: number;
  today: boolean;
  past: boolean;
  /** A set that already went out that day. */
  sent?: { title: string; status: string } | null;
  /** What the schedule will send that day. */
  planned?: { unitLabel: string; short: string; unit: number | null; byHand: boolean } | null;
};

type Unit = { number: number; title: string };

/**
 * Four weeks of practice: what went out, and what is coming.
 * Clicking a day is how the tutor sets the unit for it, or looks at the questions first.
 */
export function PracticeCalendar({
  cells,
  monthLabel,
  units,
  studentId,
  sendTime,
  count,
}: {
  cells: CalendarCell[];
  monthLabel: string;
  units: Unit[];
  studentId: string;
  sendTime: string;
  count: number;
}) {
  const [picked, setPicked] = useState<CalendarCell | null>(null);
  const [preview, setPreview] = useState<DayPreview | null>(null);
  const [openQ, setOpenQ] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  function choose(cell: CalendarCell) {
    setPicked(cell);
    setPreview(null);
    setOpenQ(null);
    setNote(null);
  }

  function apply(choice: "plan" | "skip" | number) {
    if (!picked) return;
    start(async () => {
      const res = await setPracticeDay(studentId, picked.date, choice);
      setNote(res.error ?? res.ok ?? null);
      setPreview(null);
    });
  }

  function look() {
    if (!picked) return;
    start(async () => setPreview(await previewPracticeDay(studentId, picked.date)));
  }

  return (
    <div className="calendar">
      <div className="calhead">
        <span className="month">{monthLabel}</span>
        <span className="key">Click a day to set the unit or look at the questions</span>
      </div>
      <div className="calgrid">
        {DAYS.map((d) => (
          <span key={d} className="dow">
            {d}
          </span>
        ))}
        {weeks.flatMap((week) =>
          week.map((c) => (
            <button
              type="button"
              key={c.date}
              onClick={() => choose(c)}
              className={`cell${c.today ? " today" : ""}${c.past ? " past" : ""}${picked?.date === c.date ? " picked" : ""}`}
            >
              <span className="d">{c.day}</span>
              {c.sent && <span className="chip sent">Sent</span>}
              {c.planned && (
                <span className={`chip planned${c.planned.byHand ? " byhand" : ""}`}>
                  {sendTime} · {c.planned.short}
                </span>
              )}
            </button>
          )),
        )}
      </div>

      {picked && (
        <div className="dayedit">
          <div className="card-hd" style={{ padding: 0, border: 0 }}>
            <h3>
              {new Date(picked.date).toLocaleDateString("en-SG", { weekday: "long", day: "numeric", month: "long" })}
            </h3>
            <button type="button" className="btn ghost sm" onClick={() => setPicked(null)}>
              Close
            </button>
          </div>
          <p className="note" style={{ margin: 0 }}>
            {picked.sent
              ? "A set already went out this day."
              : picked.planned
                ? `${picked.planned.unitLabel} · ${count} questions at ${sendTime}${picked.planned.byHand ? " · set by hand" : " · from the plan"}`
                : "Nothing planned for this day."}
          </p>

          {!picked.past && (
            <div className="dayrow">
              <label className="field" style={{ margin: 0 }}>
                <span className="lab">Send this day</span>
                <select
                  className="answer"
                  value={picked.planned?.byHand ? (picked.planned.unit ?? 0) : ""}
                  disabled={pending}
                  onChange={(e) => apply(Number(e.target.value))}
                >
                  <option value="" disabled>
                    Choose a unit…
                  </option>
                  <option value={0}>Every unit</option>
                  {units.map((u) => (
                    <option key={u.number} value={u.number}>
                      Unit {u.number} · {u.title}
                    </option>
                  ))}
                </select>
              </label>
              <div className="rowacts">
                <button type="button" className="btn sm" onClick={() => apply("plan")} disabled={pending}>
                  Follow the plan
                </button>
                <button type="button" className="btn ghost sm" onClick={() => apply("skip")} disabled={pending}>
                  Don&apos;t send
                </button>
                {picked.planned && (
                  <button type="button" className="btn sm" onClick={look} disabled={pending}>
                    {pending ? "Loading…" : "Show the questions"}
                  </button>
                )}
              </div>
            </div>
          )}
          {note && <p className="formmsg good" role="status">{note}</p>}

          {preview && (
            <div className="stack" style={{ gap: 8 }}>
              <p className="note" style={{ margin: 0 }}>
                {preview.unitLabel} · {preview.questions.length} question{preview.questions.length === 1 ? "" : "s"}
              </p>
              {preview.questions.length === 0 ? (
                <p className="formmsg bad" style={{ margin: 0 }}>No unseen questions left for this unit.</p>
              ) : (
                <ol className="pick">
                  {preview.questions.map((q, i) => (
                    <li key={q.id} className={openQ === q.id ? "expanded" : undefined}>
                      <span className="n">{i + 1}</span>
                      <button type="button" className="pickopen" onClick={() => setOpenQ(openQ === q.id ? null : q.id)}>
                        <QuestionLine q={q} />
                      </button>
                      {openQ === q.id && <PreviewPanel id={q.id} />}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
