"use client";

import { useActionState, useState, useTransition } from "react";
import { dropRewrite, requestRewrite, type RewriteState } from "@/lib/rewrite-actions";
import type { Rewrite } from "@/lib/rewrite";

/** The tutor asks for an answer again, and reads the second version when it comes. */
export function RewriteAsk({ responseId, rewrite }: { responseId: string; rewrite: Rewrite | null }) {
  const [state, ask, asking] = useActionState<RewriteState, FormData>(requestRewrite, {});
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(rewrite?.note ?? "");
  const [dropping, startDrop] = useTransition();

  if (rewrite?.text) {
    return (
      <div className="rewrite done">
        <div className="card-hd" style={{ padding: 0, border: 0 }}>
          <b>Their rewrite</b>
          <span className="muted" style={{ fontSize: 13 }}>
            {new Date(rewrite.at!).toLocaleDateString("en-SG", { day: "numeric", month: "short", timeZone: "Asia/Singapore" })}
          </span>
        </div>
        <p className="asked">You asked: {rewrite.note}</p>
        <div className="answerbox">{rewrite.text}</div>
        <div className="rowacts">
          <button type="button" className="btn ghost sm" onClick={() => setOpen(true)} disabled={dropping}>
            Ask again
          </button>
          <button type="button" className="btn ghost sm" onClick={() => startDrop(() => void dropRewrite(responseId))} disabled={dropping}>
            Done with it
          </button>
        </div>
        {open && <AskForm responseId={responseId} note={note} setNote={setNote} ask={ask} asking={asking} state={state} />}
      </div>
    );
  }

  if (rewrite) {
    return (
      <div className="rewrite waiting">
        <p className="asked">
          <b>Rewrite asked for</b> — waiting for it. You said: {rewrite.note}
        </p>
        <div className="rowacts">
          <button type="button" className="btn ghost sm" onClick={() => setOpen((o) => !o)}>
            Change what you asked
          </button>
          <button type="button" className="btn ghost sm" onClick={() => startDrop(() => void dropRewrite(responseId))} disabled={dropping}>
            Cancel it
          </button>
        </div>
        {open && <AskForm responseId={responseId} note={note} setNote={setNote} ask={ask} asking={asking} state={state} />}
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" className="btn ghost sm" onClick={() => setOpen(true)}>
        Ask for a rewrite
      </button>
    );
  }
  return (
    <div className="rewrite">
      <AskForm responseId={responseId} note={note} setNote={setNote} ask={ask} asking={asking} state={state} />
    </div>
  );
}

function AskForm({
  responseId,
  note,
  setNote,
  ask,
  asking,
  state,
}: {
  responseId: string;
  note: string;
  setNote: (v: string) => void;
  ask: (fd: FormData) => void;
  asking: boolean;
  state: RewriteState;
}) {
  return (
    <form action={ask} className="stack" style={{ gap: 8 }}>
      <input type="hidden" name="responseId" value={responseId} />
      <label className="qlabel" htmlFor={`rw${responseId}`}>
        What should they fix?
      </label>
      <textarea
        id={`rw${responseId}`}
        name="note"
        className="answer"
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Name the marking point they missed, and what to add."
        maxLength={1000}
      />
      <div className="rowacts">
        <button type="submit" className="btn sm primary" disabled={asking}>
          {asking ? "Sending…" : "Ask for a rewrite"}
        </button>
        {state.error && <span className="formmsg bad">{state.error}</span>}
        {state.ok && <span className="formmsg">{state.ok}</span>}
      </div>
    </form>
  );
}
