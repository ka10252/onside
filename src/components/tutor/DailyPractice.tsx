"use client";

import { useActionState } from "react";
import { DAY_NAMES, type Schedule } from "@/lib/schedule-shared";
import { sendPracticeNow, updateSchedule, type ScheduleState } from "@/lib/schedule-actions";

/** Tutor's settings for the morning set: on/off, which days, how many and from where. */
export function DailyPractice({
  schedule,
  units,
  studentName,
  sendTime,
}: {
  schedule: Schedule;
  units: { number: number; title: string }[];
  studentName: string;
  sendTime: string;
}) {
  const [state, save, saving] = useActionState<ScheduleState, FormData>(updateSchedule, {});
  const [sent, sendNow, sending] = useActionState<ScheduleState, FormData>(sendPracticeNow, {});
  const days = JSON.parse(schedule.days) as number[];
  const picked = JSON.parse(schedule.units) as number[];
  const first = studentName.split(" ")[0];

  return (
    <div className="cardbody stack" style={{ gap: 18 }}>
      <form action={save} className="formgrid">
        <input type="hidden" name="studentId" value={schedule.student_id} />
        <label className="check">
          <input type="checkbox" name="enabled" defaultChecked={schedule.enabled === 1} />
          <span>
            Send {first} a set every practice morning, around {sendTime}
          </span>
        </label>

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
            <label htmlFor="count">Questions</label>
            <input id="count" name="count" className="answer" type="number" min={1} max={20} defaultValue={schedule.count} />
          </div>
          <div className="field">
            <label htmlFor="dueDays">Due</label>
            <select id="dueDays" name="dueDays" className="answer" defaultValue={schedule.due_days ?? ""}>
              <option value="">No due date</option>
              <option value="0">Same day</option>
              <option value="1">Next day</option>
              <option value="2">In 2 days</option>
              <option value="7">In a week</option>
            </select>
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
            <label htmlFor="unit">Unit</label>
            <select id="unit" name="unit" className="answer" defaultValue={picked[0] ?? ""}>
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
