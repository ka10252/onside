"use client";

import { useActionState } from "react";
import { updateHints, type FormState } from "@/lib/admin-actions";

export function HintEditor({ questionId, hints }: { questionId: string; hints: [string, string] | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateHints, {});
  return (
    <details className="sub">
      <summary>{hints ? "Hints" : "Hints · none yet"}</summary>
      <form action={action} className="formgrid" style={{ padding: "0 14px 14px" }}>
        <input type="hidden" name="questionId" value={questionId} />
        <div className="field">
          <label htmlFor={`${questionId}-h1`}>Hint 1 · max score 90%</label>
          <textarea id={`${questionId}-h1`} name="hint1" className="working" style={{ minHeight: 60, fontSize: 15 }} defaultValue={hints?.[0] ?? ""} />
        </div>
        <div className="field">
          <label htmlFor={`${questionId}-h2`}>Hint 2 · max score 70%</label>
          <textarea id={`${questionId}-h2`} name="hint2" className="working" style={{ minHeight: 60, fontSize: 15 }} defaultValue={hints?.[1] ?? ""} />
        </div>
        {state.error && <p className="formmsg bad" role="alert">{state.error}</p>}
        {state.ok && <p className="formmsg" role="status">{state.ok}</p>}
        <div>
          <button type="submit" className="btn sm" disabled={pending}>{pending ? "Saving…" : "Save hints"}</button>
        </div>
      </form>
    </details>
  );
}
