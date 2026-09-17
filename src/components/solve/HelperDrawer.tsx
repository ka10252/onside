"use client";

import { useEffect, useRef, useState, useTransition, type Dispatch, type SetStateAction } from "react";
import { openHint } from "@/lib/student-actions";
import { ArrowRight, CloseIcon, EyeIcon } from "../Icons";

const LOCK_S = 90;
const RING = 2 * Math.PI * 64;
const CAPS = ["100%", "90%", "70%"];

export type Msg = { who: "me" | "ai" | "marker"; text: string };

export function HelperDrawer({
  responseId,
  unlockAt,
  hasHints,
  hints,
  onHint,
  onClose,
  msgs,
  setMsgs,
}: {
  responseId: string;
  unlockAt: number;
  hasHints: boolean;
  hints: string[];
  onHint: (hint: string) => void;
  onClose: () => void;
  msgs: Msg[];
  setMsgs: Dispatch<SetStateAction<Msg[]>>;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [confirm, setConfirm] = useState<1 | 2 | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const logRef = useRef<HTMLDivElement>(null);
  const remaining = Math.max(0, Math.ceil((unlockAt - now) / 1000));
  const locked = remaining > 0;

  useEffect(() => {
    if (!locked) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [locked]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [msgs, busy]);

  function doOpenHint(level: 1 | 2) {
    setError(null);
    start(async () => {
      const res = await openHint(responseId, level);
      setConfirm(null);
      if ("error" in res) return setError(res.error);
      onHint(res.hint);
      setMsgs((m) => [...m, { who: "marker", text: `Hint ${level} opened` }]);
    });
  }

  async function ask(text: string, kind: "question" | "hint_confused" = "question") {
    const message = text.trim();
    if (!message || busy) return;
    setError(null);
    setInput("");
    setMsgs((m) => [...m, { who: "me", text: message }]);
    setBusy(true);
    try {
      const res = await fetch("/api/helper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responseId, message, kind }),
      });
      const data = (await res.json()) as { reply?: string; error?: string };
      if (data.reply) setMsgs((m) => [...m, { who: "ai", text: data.reply! }]);
      else setError(data.error ?? "The Helper is busy. Try again in a minute.");
    } catch {
      setError("The Helper is busy. Try again in a minute.");
    } finally {
      setBusy(false);
    }
  }

  const level = hints.length;

  return (
    <>
      <div className="dscrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="helper-title">
        <div className="dh">
          <h2 id="helper-title">Helper</h2>
          <button type="button" className="xbtn" onClick={onClose} aria-label="Close the Helper">
            <CloseIcon />
          </button>
        </div>
        <p className="dtrans">
          <EyeIcon /> Your tutor can see how you use the AI Helper, and when you paste text or leave this tab.
        </p>

        {locked ? (
          <div className="dbody">
          <div className="lockbox">
            <div className="ring">
              <svg width="150" height="150" viewBox="0 0 150 150" aria-hidden="true">
                <circle className="track" cx="75" cy="75" r="64" />
                <circle
                  className="fill"
                  cx="75"
                  cy="75"
                  r="64"
                  strokeDasharray={RING.toFixed(1)}
                  strokeDashoffset={((RING * remaining) / LOCK_S).toFixed(1)}
                />
              </svg>
              <div className="num">
                <b>{remaining}</b>
                <span>seconds</span>
              </div>
            </div>
            <h3>Give it a proper try first.</h3>
            <p>The Helper opens when the countdown ends.</p>
            <button type="button" className="btn" onClick={onClose}>
              Back to the question
            </button>
          </div>
          <div className="log" />
          <div className="dfoot">
            <div className="ask">
              <input aria-label="Ask the Helper" placeholder={`Opens in ${remaining} s`} disabled />
              <button type="button" className="iconbtn" aria-label="Send" disabled>
                <ArrowRight color="#FFFFFF" />
              </button>
            </div>
            <p className="note">Questions don&apos;t cost points.</p>
          </div>
          </div>
        ) : (
          <div className="dbody">
            <div className="hzone">
              {hasHints && level === 0 && (
                <div className="hrow">
                  <span>Stuck? A hint lowers your max score to 90%.</span>
                  <button type="button" className="btn sm" onClick={() => setConfirm(1)}>
                    Open Hint 1
                  </button>
                </div>
              )}
              {level > 0 && (
                <div className="hcard">
                  <span className="hlab">
                    Hint {level} of 2
                  </span>
                  <p>{hints[level - 1]}</p>
                  <div className="chips">
                    <button
                      type="button"
                      className="chip strong"
                      disabled={busy}
                      onClick={() => void ask(`I don't get Hint ${level}.`, "hint_confused")}
                    >
                      I don&apos;t get this hint
                    </button>
                    {level === 1 && (
                      <button type="button" className="chip" onClick={() => setConfirm(2)}>
                        Open Hint 2 · last hint
                      </button>
                    )}
                  </div>
                  {level === 2 && (
                    <details className="prev">
                      <summary>Hint 1</summary>
                      <p>{hints[0]}</p>
                    </details>
                  )}
                </div>
              )}
              {!hasHints && <p className="note">No written hints for this question. Ask about the step you are stuck on.</p>}
            </div>

            <div className="askdiv">Ask about this hint or any step</div>
            <div className="log" ref={logRef} aria-live="polite">
              {msgs.length === 0 && !busy && <p className="empty">Say which step you are stuck on.</p>}
              {msgs.map((m, i) =>
                m.who === "marker" ? (
                  <div key={i} className="marker">{m.text}</div>
                ) : (
                  <div key={i} className={`msg ${m.who}`}>
                    <span className="who">{m.who === "me" ? "You" : "Helper"}</span>
                    <p>{m.text}</p>
                  </div>
                ),
              )}
              {busy && (
                <div className="msg ai">
                  <span className="who">Helper</span>
                  <p className="dots" aria-label="Helper is typing">
                    <span />
                    <span />
                    <span />
                  </p>
                </div>
              )}
            </div>
            <div className="dfoot">
              {error && <p className="formmsg bad" role="alert">{error}</p>}
              <form
                className="ask"
                onSubmit={(e) => {
                  e.preventDefault();
                  void ask(input);
                }}
              >
                <input
                  aria-label="Ask the Helper"
                  placeholder="Ask about this hint or your working"
                  value={input}
                  maxLength={1000}
                  onChange={(e) => setInput(e.target.value)}
                />
                <button type="submit" className="iconbtn" aria-label="Send" disabled={busy || !input.trim()}>
                  <ArrowRight color="#FFFFFF" />
                </button>
              </form>
              <p className="note">Questions don&apos;t cost points.</p>
            </div>
          </div>
        )}
      </aside>

      {confirm && (
        <div className="scrim" role="dialog" aria-modal="true" aria-labelledby="hint-title">
          <div className="dialog">
            <h2 id="hint-title">Open Hint {confirm}?</h2>
            <p>Your max score for this question drops.</p>
            <div className="drop">
              <s>{CAPS[confirm - 1]}</s>
              <ArrowRight />
              <b>{CAPS[confirm]}</b>
            </div>
            <div className="acts">
              <button type="button" className="btn" onClick={() => setConfirm(null)}>
                Keep trying
              </button>
              <button type="button" className="btn primary" disabled={pending} onClick={() => doOpenHint(confirm)}>
                Open Hint {confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
