"use client";

import { useActionState, useState } from "react";
import { confirmMark, type ReviewState } from "@/lib/review-actions";

export function MarkForm({
  assignmentId,
  responseId,
  questionId,
  max,
  suggested,
  draft,
  current,
  note,
}: {
  assignmentId: string;
  responseId: string | null;
  questionId: string;
  max: number;
  suggested: number | null;
  /** What the AI would write to the student. Only a starting point; the tutor owns what is sent. */
  draft?: string;
  current: number | null;
  note?: string;
}) {
  const [state, action, pending] = useActionState<ReviewState, FormData>(confirmMark, {});
  const [comment, setComment] = useState(note ?? draft ?? "");
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
      <textarea
        className="answer note-in"
        name="note"
        rows={2}
        placeholder="Comment for the student (optional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={500}
      />
      <button type="submit" className="btn primary sm" disabled={pending}>
        {current !== null ? "Update" : suggested !== null ? "Confirm" : "Save marks"}
      </button>
      {draft && comment !== draft && (
        <button type="button" className="btn ghost sm" onClick={() => setComment(draft)} disabled={pending}>
          Use the draft
        </button>
      )}
      {state.error && <span className="formmsg bad" role="alert">{state.error}</span>}
      {state.ok && <span className="formmsg" role="status">{state.ok}</span>}
    </form>
  );
}
