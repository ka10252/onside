"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PreviewPanel, QuestionLine } from "@/components/QuestionPreview";
import { previewPracticeDay, sendSetNow, setPracticeDay, type DayPreview, type DaySlotInput } from "@/lib/schedule-actions";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type CalendarSlot = { time: string; short: string; unit: number | null; count: number; byHand: boolean };

export type CalendarCell = {
  date: string;
  /** Day of the month. */
  day: number;
  today: boolean;
  past: boolean;
  /** Sets that already went out that day. */
  sent: { id: string; title: string; status: string; time: string; count: number; short: string; done: boolean }[];
  /** Sets the schedule will still send that day. */
  planned: CalendarSlot[];
};

type Unit = { number: number; title: string };

/**
 * Four weeks of practice: what went out, and what is coming.
 * Clicking a day is how the tutor sets what it sends — a day can hold more than one set.
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
  const [slots, setSlots] = useState<DaySlotInput[]>([]);
  const [preview, setPreview] = useState<DayPreview | null>(null);
  const [showQuestions, setShowQuestions] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  function choose(cell: CalendarCell) {
    setPicked(cell);
    setPreview(null);
    setShowQuestions(false);
    setNote(null);
    setSlots(
      cell.planned.length
        ? cell.planned.map((p) => ({ time: p.time, unit: p.unit ?? 0, count: p.count }))
        : [{ time: sendTime, unit: 0, count }],
    );
  }

  function apply(choice: "plan" | "skip" | DaySlotInput[]) {
    if (!picked) return;
    start(async () => {
      const res = await setPracticeDay(studentId, picked.date, choice);
      setNote(res.error ?? res.ok ?? null);
      if (!res.error) {
        setPreview(await previewPracticeDay(studentId, picked.date));
        router.refresh(); // the squares come from the page
      }
    });
  }

  function sendNow() {
    if (!picked) return;
    const first = slots[0];
    if (!first) return;
    start(async () => {
      const res = await sendSetNow(studentId, { unit: first.unit, count: first.count });
      setNote(res.error ?? res.ok ?? null);
      if (!res.error) router.refresh();
    });
  }

  function look() {
    if (!picked) return;
    start(async () => {
      setPreview(await previewPracticeDay(studentId, picked.date));
      setShowQuestions(true);
    });
  }

  const edit = (i: number, patch: Partial<DaySlotInput>) => setSlots((cur) => cur.map((s, j) => (j === i ? { ...s, ...patch } : s)));

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
      <p className="note" style={{ margin: "0 0 8px" }}>Click a day to set what it sends. A day can hold more than one set.</p>
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
              {c.sent.map((x) => (
                <span key={x.id} className={`chip ${x.done ? "done" : "waiting"}`}>
                  {x.time} · {x.short} · {x.count}
                </span>
              ))}
              {c.planned.map((p) => (
                <span key={`p${p.time}`} className={`chip planned${p.byHand ? " byhand" : ""}`}>
                  {p.time} · {p.short} · {p.count}
                </span>
              ))}
            </button>
          )),
        )}
      </div>

      {picked && (
        <div className="dayedit">
          <div className="card-hd" style={{ padding: 0, border: 0 }}>
            <h3>{new Date(picked.date).toLocaleDateString("en-SG", { weekday: "long", day: "numeric", month: "long" })}</h3>
            <button type="button" className="btn ghost sm" onClick={() => setPicked(null)}>
              Close
            </button>
          </div>

          {picked.sent.length > 0 && (
            <p className="note" style={{ margin: 0 }}>
              Already sent:{" "}
              {picked.sent
                .map(
                  (x) =>
                    `${x.time} · ${x.count} questions · ${
                      x.status === "reviewed"
                        ? "marked"
                        : x.status === "submitted"
                          ? "finished, waiting for marks"
                          : x.status === "in_progress"
                            ? "started"
                            : "not opened yet"
                    }`,
                )
                .join(" · ")}
            </p>
          )}

          {!picked.past && (
            <>
              <ol className="slotlist">
                {slots.map((s, i) => (
                  <li key={i}>
                    <span className="n">{i + 1}</span>
                    <label>
                      <span className="lab">At</span>
                      <input type="time" value={s.time} disabled={pending} onChange={(e) => edit(i, { time: e.target.value })} />
                    </label>
                    <label className="grow">
                      <span className="lab">Unit</span>
                      <select value={s.unit} disabled={pending} onChange={(e) => edit(i, { unit: Number(e.target.value) })}>
                        <option value={0}>Every unit</option>
                        {units.map((u) => (
                          <option key={u.number} value={u.number}>
                            Unit {u.number} · {u.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className="lab">Questions</span>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={s.count}
                        disabled={pending}
                        onChange={(e) => edit(i, { count: Number(e.target.value) })}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn ghost sm"
                      disabled={pending || slots.length === 1}
                      onClick={() => setSlots((cur) => cur.filter((_, j) => j !== i))}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ol>
              <div className="rowacts">
                <button
                  type="button"
                  className="btn sm"
                  disabled={pending}
                  onClick={() =>
                    setSlots((cur) => [
                      ...cur,
                      { time: nextFreeTime(cur.map((c) => c.time)), unit: cur.at(-1)?.unit ?? 0, count: cur.at(-1)?.count ?? count },
                    ])
                  }
                >
                  Add another set
                </button>
                <button type="button" className="btn primary" onClick={() => apply(slots)} disabled={pending}>
                  {pending ? "Saving…" : slots.length > 1 ? `Set these ${slots.length} sets` : "Set this day"}
                </button>
                <button type="button" className="btn accent" onClick={sendNow} disabled={pending} title="Sends the first row's unit and count straight away">
                  Send now
                </button>
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
            <div className="stack" style={{ gap: 14 }}>
              {preview.sets.length === 0 && <p className="formmsg bad" style={{ margin: 0 }}>Nothing goes out this day.</p>}
              {preview.sets.map((set) => (
                <div key={set.time} className="stack" style={{ gap: 8 }}>
                  <p className="note" style={{ margin: 0 }}>
                    <b>{set.time}</b> · {set.unitLabel} · {set.questions.length} question{set.questions.length === 1 ? "" : "s"}
                    {set.sent ? " · already sent" : ""} · answers shown
                  </p>
                  {set.questions.length === 0 ? (
                    <p className="formmsg bad" style={{ margin: 0 }}>No unseen questions left for this unit.</p>
                  ) : (
                    <ol className="fullpreview">
                      {set.questions.map((q, i) => (
                        <li key={q.id}>
                          <span className="n">Question {i + 1}</span>
                          <QuestionLine q={q} />
                          <PreviewPanel id={q.id} />
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The first free time after the last set, so a new row never clashes. */
export function nextFreeTime(taken: string[]) {
  const last = [...taken].sort().at(-1) ?? "06:00";
  const [h = 6, m = 0] = last.split(":").map(Number);
  for (let i = 1; i <= 24 * 4; i++) {
    const mins = ((h * 60 + m + i * 15) % (24 * 60) + 24 * 60) % (24 * 60);
    const time = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
    if (!taken.includes(time)) return time;
  }
  return "23:45";
}
