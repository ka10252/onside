"use client";

import { useActionState } from "react";
import { confirmMark, type ReviewState } from "@/lib/review-actions";

export function MarkForm({
  assignmentId,
  responseId,
  questionId,
  max,
  suggested,
  current,
  note,
}: {
  assignmentId: string;
  responseId: string | null;
  questionId: string;
  max: number;
  suggested: number | null;
  current: number | null;
  note?: string;
}) {
  const [state, action, pending] = useActionState<ReviewState, FormData>(confirmMark, {});
  return (
    <form action={action} className="markform">
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <input type="hidden" name="responseId" value={responseId ?? ""} />
      <input type="hidden" name="questionId" value={questionId} />
      <label>
        Marks
        <input
          className="answer"
          name="marks"
          type="number"
          min={0}
          max={max}
          step={0.5}
          defaultValue={current ?? suggested ?? ""}
          required
        />
        <span className="muted">/ {max}</span>
      </label>
      <input className="answer note-in" name="note" placeholder="Note for the student (optional)" defaultValue={note ?? ""} maxLength={500} />
      <button type="submit" className="btn primary sm" disabled={pending}>
        {current !== null ? "Update" : suggested !== null ? "Confirm" : "Save marks"}
      </button>
      {state.error && <span className="formmsg bad" role="alert">{state.error}</span>}
      {state.ok && <span className="formmsg" role="status">{state.ok}</span>}
    </form>
  );
}
