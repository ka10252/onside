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
  sent?: { title: string; status: string; time: string; count: number; short: string; done: boolean } | null;
  /** What the schedule will send that day. */
  planned?: { unitLabel: string; short: string; unit: number | null; count: number; byHand: boolean } | null;
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
  const [showQuestions, setShowQuestions] = useState(false);
  const [unit, setUnit] = useState(0);
  const [howMany, setHowMany] = useState(count);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  function choose(cell: CalendarCell) {
    setPicked(cell);
    setPreview(null);
    setShowQuestions(false);
    setNote(null);
    setUnit(cell.planned?.unit ?? 0);
    setHowMany(cell.planned?.count ?? count);
  }

  function apply(choice: "plan" | "skip" | { unit: number; count: number }) {
    if (!picked) return;
    start(async () => {
      const res = await setPracticeDay(studentId, picked.date, choice);
      setNote(res.error ?? res.ok ?? null);
      if (!res.error) setPreview(await previewPracticeDay(studentId, picked.date));
    });
  }

  function look() {
    if (!picked) return;
    start(async () => {
      setPreview(await previewPracticeDay(studentId, picked.date));
      setShowQuestions(true);
    });
  }

  return (
    <div className="calendar">
      <div className="calhead">
        <span className="month">{monthLabel}</span>
        <span className="key">
          <span className="chip planned">To come</span>
          <span className="chip waiting">Sent, not finished</span>
          <span className="chip done">Finished</span>
        </span>
      </div>
      <p className="note" style={{ margin: "0 0 8px" }}>Click a day to set its unit and how many questions, or to see them.</p>
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
              {c.sent && (
                <span className={`chip ${c.sent.done ? "done" : "waiting"}`}>
                  {c.sent.time} · {c.sent.short} · {c.sent.count}
                </span>
              )}
              {c.planned && (
                <span className={`chip planned${c.planned.byHand ? " byhand" : ""}`}>
                  {sendTime} · {c.planned.short} · {c.planned.count}
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
              ? `${picked.sent.title} · sent ${picked.sent.time} · ${picked.sent.count} questions · ${
                  picked.sent.status === "reviewed"
                    ? "marked"
                    : picked.sent.status === "submitted"
                      ? "finished, waiting for marks"
                      : picked.sent.status === "in_progress"
                        ? "started"
                        : "not opened yet"
                }`
              : picked.planned
                ? `${picked.planned.unitLabel} · ${picked.planned.count} questions at ${sendTime}${picked.planned.byHand ? " · set by hand" : " · from the plan"}`
                : "Nothing planned for this day."}
          </p>

          {!picked.past && (
            <>
              <div className="dayrow">
                <label className="field" style={{ margin: 0 }}>
                  <span className="lab">Unit</span>
                  <select className="answer" value={unit} disabled={pending} onChange={(e) => setUnit(Number(e.target.value))}>
                    <option value={0}>Every unit</option>
                    {units.map((u) => (
                      <option key={u.number} value={u.number}>
                        Unit {u.number} · {u.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field howmany" style={{ margin: 0 }}>
                  <span className="lab">Questions</span>
                  <input
                    className="answer"
                    type="number"
                    min={1}
                    max={20}
                    value={howMany}
                    disabled={pending}
                    onChange={(e) => setHowMany(Number(e.target.value))}
                  />
                </label>
                <button type="button" className="btn primary" onClick={() => apply({ unit, count: howMany })} disabled={pending}>
                  {pending ? "Saving…" : "Set this day"}
                </button>
              </div>
              <div className="rowacts">
                <button type="button" className="btn sm" onClick={look} disabled={pending}>
                  {pending ? "Loading…" : "Show the questions"}
                </button>
                <button type="button" className="btn sm" onClick={() => apply("plan")} disabled={pending}>
                  Follow the plan
                </button>
                <button type="button" className="btn ghost sm" onClick={() => apply("skip")} disabled={pending}>
                  Don&apos;t send
                </button>
              </div>
            </>
          )}
          {note && <p className="formmsg good" role="status">{note}</p>}

          {preview && showQuestions && (
            <div className="stack" style={{ gap: 8 }}>
              <p className="note" style={{ margin: 0 }}>
                {preview.unitLabel} · {preview.questions.length} question{preview.questions.length === 1 ? "" : "s"} · answers shown
              </p>
              {preview.questions.length === 0 ? (
                <p className="formmsg bad" style={{ margin: 0 }}>No unseen questions left for this unit.</p>
              ) : (
                <ol className="fullpreview">
                  {preview.questions.map((q, i) => (
                    <li key={q.id}>
                      <span className="n">Question {i + 1}</span>
                      <QuestionLine q={q} />
                      <PreviewPanel id={q.id} />
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
