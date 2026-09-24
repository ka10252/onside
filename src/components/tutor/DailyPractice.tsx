"use client";

import { useActionState, useState } from "react";
import type { BankQuestion } from "@/lib/admin";
import { formatDue } from "@/lib/due";
import { PreviewPanel, QuestionLine } from "@/components/QuestionPreview";
import { DAY_NAMES, type Schedule } from "@/lib/schedule-shared";
import { sendPracticeNow, updateSchedule, type ScheduleState } from "@/lib/schedule-actions";

type Unit = { number: number; title: string };

/** The tutor's settings for the morning set: when it goes out, how many, and which unit on which day. */
export function DailyPractice({
  schedule,
  units,
  studentName,
  next,
}: {
  schedule: Schedule;
  units: Unit[];
  studentName: string;
  next: { date: string | null; unitLabel: string; questions: BankQuestion[] };
}) {
  const [state, save, saving] = useActionState<ScheduleState, FormData>(updateSchedule, {});
  const [sent, sendNow, sending] = useActionState<ScheduleState, FormData>(sendPracticeNow, {});
  const days = JSON.parse(schedule.days) as number[];
  const [plan, setPlan] = useState<number[]>(() => JSON.parse(schedule.plan) as number[]);
  const [dueDays, setDueDays] = useState<string>(schedule.due_days === null ? "" : String(schedule.due_days));
  const [open, setOpen] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const first = studentName.split(" ")[0];
  const title = (u: number) => (u === 0 ? "Every unit" : `Unit ${u} · ${units.find((x) => x.number === u)?.title ?? ""}`);
  const move = (i: number, by: number) =>
    setPlan((cur) => {
      const j = i + by;
      if (j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  const dueOn =
    next.date && schedule.due_days !== null
      ? new Date(new Date(`${next.date}T00:00:00Z`).getTime() + schedule.due_days * 86_400_000).toISOString().slice(0, 10)
      : null;

  return (
    <div className="cardbody stack" style={{ gap: 18 }}>
      <section className="nextset">
        <div className="card-hd" style={{ padding: 0, border: 0 }}>
          <h3>Next set</h3>
          {next.questions.length > 0 && (
            <button type="button" className="btn sm" onClick={() => setFull(true)}>
              Open full view
            </button>
          )}
          <span className="muted" style={{ fontSize: 14 }}>
            {schedule.enabled === 0
              ? "Daily practice is off"
              : next.date
                ? `${new Date(next.date).toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short" })} at ${schedule.send_at}`
                : "No practice day chosen"}
          </span>
        </div>
        <p className="note" style={{ marginTop: 4 }}>
          {next.unitLabel} · {next.questions.length} question{next.questions.length === 1 ? "" : "s"}
          {dueOn ? ` · finish by ${formatDue(schedule.due_time ? `${dueOn}T${schedule.due_time}` : dueOn)}` : " · no deadline"}
        </p>
        {next.questions.length === 0 ? (
          <p className="formmsg bad" style={{ marginTop: 8 }}>
            No unseen questions left for this unit. Change the plan, or pick another source.
          </p>
        ) : (
          <ol className="pick" style={{ marginTop: 10 }}>
            {next.questions.map((q, i) => (
              <li key={q.id} className={open === q.id ? "expanded" : undefined}>
                <span className="n">{i + 1}</span>
                <button type="button" className="pickopen" aria-expanded={open === q.id} onClick={() => setOpen(open === q.id ? null : q.id)}>
                  <QuestionLine q={q} />
                </button>
                {open === q.id && <PreviewPanel id={q.id} />}
              </li>
            ))}
          </ol>
        )}
        <p className="note" style={{ marginTop: 8 }}>
          These are the questions that will go out. Saving different settings changes them.
        </p>
      </section>

      {full && (
        <div className="scrim" role="dialog" aria-modal="true" aria-label="Next set" onClick={() => setFull(false)}>
          <div className="dialog wide" onClick={(e) => e.stopPropagation()}>
            <div className="card-hd" style={{ padding: 0, border: 0 }}>
              <h2>Next set</h2>
              <button type="button" className="btn sm" onClick={() => setFull(false)}>
                Close
              </button>
            </div>
            <p className="note" style={{ margin: 0 }}>
              {next.unitLabel} · {next.questions.length} question{next.questions.length === 1 ? "" : "s"}
              {next.date ? ` · ${new Date(next.date).toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short" })} at ${schedule.send_at}` : ""}
            </p>
            <ol className="fullpreview">
              {next.questions.map((q, i) => (
                <li key={q.id}>
                  <span className="n">Question {i + 1}</span>
                  <QuestionLine q={q} />
                  <PreviewPanel id={q.id} />
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      <form action={save} className="formgrid">
        <input type="hidden" name="studentId" value={schedule.student_id} />
        <input type="hidden" name="plan" value={JSON.stringify(plan)} />
        <label className="check">
          <input type="checkbox" name="enabled" defaultChecked={schedule.enabled === 1} />
          <span>Send {first} a set automatically</span>
        </label>

        <div className="two-up">
          <div className="field">
            <label htmlFor="sendAt">Send at</label>
            <input id="sendAt" name="sendAt" className="answer" type="time" defaultValue={schedule.send_at} />
            <span className="note">Singapore time</span>
          </div>
          <div className="field">
            <label htmlFor="count">Questions each time</label>
            <input id="count" name="count" className="answer" type="number" min={1} max={20} defaultValue={schedule.count} />
          </div>
        </div>

        <div className="field">
          <span className="lab">Days</span>
          <div className="daypick">
            {DAY_NAMES.map((d, i) => (
              <label key={d} className="daybox">
                <input type="checkbox" name="days" value={i} defaultChecked={days.includes(i)} />
                <span>{d}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="two-up">
          <div className="field">
            <label htmlFor="dueDays">Finish by</label>
            <select id="dueDays" name="dueDays" className="answer" value={dueDays} onChange={(e) => setDueDays(e.target.value)}>
              <option value="">No deadline</option>
              <option value="0">Same day</option>
              <option value="1">Next day</option>
              <option value="2">In 2 days</option>
              <option value="7">In a week</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="dueTime">By what time</label>
            <input
              id="dueTime"
              name="dueTime"
              className="answer"
              type="time"
              defaultValue={schedule.due_time ?? ""}
              disabled={dueDays === ""}
            />
            <span className="note">Leave empty for end of that day</span>
          </div>
        </div>

        <div className="field">
          <span className="lab">Which unit, day by day</span>
          <p className="note" style={{ marginTop: 4 }}>
            The sets follow this list in order and start again at the top. Leave it empty to pick from every unit each time.
          </p>
          {plan.length > 0 && (
            <ol className="planlist">
              {plan.map((u, i) => (
                <li key={`${u}-${i}`} className={i === schedule.plan_index % plan.length ? "next" : undefined}>
                  <span className="n">{i + 1}</span>
                  <select value={u} onChange={(e) => setPlan((cur) => cur.map((x, j) => (j === i ? Number(e.target.value) : x)))}>
                    <option value={0}>Every unit</option>
                    {units.map((x) => (
                      <option key={x.number} value={x.number}>
                        {x.number} · {x.title}
                      </option>
                    ))}
                  </select>
                  <span className="rowacts">
                    {i === schedule.plan_index % plan.length && <span className="pill gray">Next</span>}
                    <button type="button" className="btn ghost sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => move(i, 1)}
                      disabled={i === plan.length - 1}
                      aria-label="Move down"
                    >
                      ↓
                    </button>
                    <button type="button" className="btn ghost sm" onClick={() => setPlan((cur) => cur.filter((_, j) => j !== i))}>
                      Remove
                    </button>
                  </span>
                </li>
              ))}
            </ol>
          )}
          <div className="rowacts" style={{ marginTop: 10 }}>
            <button type="button" className="btn sm" onClick={() => setPlan((cur) => [...cur, cur.at(-1) ?? units[0]?.number ?? 0])}>
              Add a day
            </button>
            {plan.length > 0 && (
              <button type="button" className="btn ghost sm" onClick={() => setPlan([])}>
                Clear the plan
              </button>
            )}
            {plan.length > 0 && (
              <span className="muted" style={{ fontSize: 14 }}>
                Next: {title(plan[schedule.plan_index % plan.length]!)}
              </span>
            )}
          </div>
        </div>

        <div className="two-up">
          <div className="field">
            <label htmlFor="source">Questions from</label>
            <select id="source" name="source" className="answer" defaultValue={schedule.source}>
              <option value="test">Unit tests</option>
              <option value="past">Past papers</option>
              <option value="mix">Both</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="unit">Unit when there is no plan</label>
            <select id="unit" name="unit" className="answer" defaultValue={(JSON.parse(schedule.units) as number[])[0] ?? ""}>
              <option value="">Every unit</option>
              {units.map((u) => (
                <option key={u.number} value={u.number}>
                  {u.number} · {u.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <span className="lab">AI Helper</span>
          <div className="modes" style={{ borderBottom: 0, paddingBlock: 0 }}>
            <label>
              <input type="radio" name="helper" value="on" defaultChecked={schedule.helper === "on"} /> On
            </label>
            <label>
              <input type="radio" name="helper" value="off" defaultChecked={schedule.helper === "off"} /> Off
            </label>
          </div>
        </div>

        {state.error && <p className="formmsg bad" role="alert">{state.error}</p>}
        {state.ok && <p className="formmsg good" role="status">{state.ok}</p>}
        <div>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>

      <form action={sendNow} className="stack" style={{ gap: 8 }}>
        <input type="hidden" name="studentId" value={schedule.student_id} />
        <div className="rowacts">
          <button type="submit" className="btn" disabled={sending}>
            {sending ? "Sending…" : "Send one now"}
          </button>
          <span className="muted" style={{ fontSize: 14 }}>
            {schedule.last_sent_on ? `Last sent ${schedule.last_sent_on}` : "Nothing sent yet"}
          </span>
        </div>
        {sent.error && <p className="formmsg bad" role="alert">{sent.error}</p>}
        {sent.ok && <p className="formmsg good" role="status">{sent.ok}</p>}
      </form>
    </div>
  );
}
