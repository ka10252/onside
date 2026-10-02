"use client";

import { useActionState, useState } from "react";
import { sendRewrite, type RewriteState } from "@/lib/rewrite-actions";
import type { Rewrite } from "@/lib/rewrite";

/** The student writes the answer a second time, against what the tutor asked for. */
export function RewriteBox({ responseId, rewrite }: { responseId: string; rewrite: Rewrite }) {
  const [state, send, sending] = useActionState<RewriteState, FormData>(sendRewrite, {});
  const [text, setText] = useState(rewrite.text ?? "");
  const sent = Boolean(rewrite.text) || Boolean(state.ok);

  return (
    <section className="rewrite ask">
      <div className="card-hd" style={{ padding: 0, border: 0 }}>
        <b>Your tutor asked you to write this one again</b>
        {sent && <span className="pill green">Sent</span>}
      </div>
      <p className="asked">{rewrite.note}</p>
      {sent ? (
        <div className="answerbox">{text || rewrite.text}</div>
      ) : (
        <form action={send} className="stack" style={{ gap: 8 }}>
          <input type="hidden" name="responseId" value={responseId} />
          <textarea
            name="text"
            className="working"
            style={{ minHeight: 160 }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write the answer again, with what your tutor asked for."
          />
          <div className="rowacts">
            <button type="submit" className="btn primary" disabled={sending}>
              {sending ? "Sending…" : "Send the rewrite"}
            </button>
            {state.error && <span className="formmsg bad" role="alert">{state.error}</span>}
          </div>
        </form>
      )}
    </section>
  );
}
