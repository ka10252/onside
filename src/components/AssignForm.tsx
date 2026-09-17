"use client";

import { useActionState } from "react";
import { assignSet, type FormState } from "@/lib/admin-actions";

type Option = { id: string; label: string; note?: string; disabled?: boolean };

// Either a fixed set with a student picker (set page) or a fixed student with a set picker (student page).
export function AssignForm({
  setId,
  studentId,
  studentName,
  sets,
  students,
}: {
  setId?: string;
  studentId?: string;
  studentName?: string;
  sets?: Option[];
  students?: Option[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(assignSet, {});
  const count = students?.filter((s) => !s.disabled).length ?? 0;

  return (
    <form action={action} className="formgrid">
      {setId && <input type="hidden" name="setId" value={setId} />}
      {studentId && <input type="hidden" name="studentId" value={studentId} />}

      {sets && (
        <div className="field">
          <label htmlFor="setId">Set</label>
          {sets.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>No sets yet. Make one under Sets.</p>
          ) : (
            <select id="setId" name="setId" className="answer" defaultValue="" required>
              <option value="" disabled>Choose a set</option>
              {sets.map((s) => (
                <option key={s.id} value={s.id} disabled={s.disabled}>
                  {s.label}
                  {s.note ? ` — ${s.note}` : ""}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {students && (
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Students</legend>
          {students.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>No students yet. Add one under Students.</p>
          ) : (
            students.map((s) => (
              <label key={s.id} className="opt">
                <input type="checkbox" name="studentId" value={s.id} disabled={s.disabled} style={{ accentColor: "var(--ink)", width: 18, height: 18 }} />
                <span>{s.label}</span>
                {s.note && <span className="muted" style={{ fontSize: 13 }}>{s.note}</span>}
              </label>
            ))
          )}
        </fieldset>
      )}

      <div className="field">
        <label htmlFor="due">
          Due <span className="muted" style={{ fontWeight: 400 }}>(optional)</span>
        </label>
        <input id="due" name="due" type="date" className="answer" style={{ maxWidth: 220 }} />
      </div>

      {state.error && <p className="formmsg bad" role="alert">{state.error}</p>}
      {state.ok && <p className="formmsg" role="status">{state.ok}</p>}

      <div>
        <button
          type="submit"
          className="btn accent"
          disabled={pending || (sets?.length === 0) || (students !== undefined && count === 0)}
        >
          {pending ? "Sending…" : studentName ? `Send to ${studentName.split(" ")[0]}` : "Send to students"}
        </button>
      </div>
    </form>
  );
}
