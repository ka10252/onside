"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * A button that asks first, then submits a server action.
 * The dialog is a plain box with the form inside it, so it lays out the same wherever the button
 * sits — including inside a table row.
 */
export function ConfirmForm({
  action,
  hidden = {},
  label,
  title,
  body,
  details,
  confirmLabel,
  className = "btn",
  danger = false,
  disabled = false,
}: {
  action: (fd: FormData) => void | Promise<void>;
  hidden?: Record<string, string>;
  label: ReactNode;
  title: string;
  body: ReactNode;
  /** Short lines listing what the action touches. */
  details?: string[];
  confirmLabel: string;
  className?: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !pending && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending]);

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} disabled={disabled}>
        {label}
      </button>
      {open && (
        <div className="scrim" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className={`dialog${danger ? " danger" : ""}`}>
            <h2 id="confirm-title">{title}</h2>
            <p>{body}</p>
            {details && details.length > 0 && (
              <ul className="dlist">
                {details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            )}
            <form
              className="acts"
              action={async (fd) => {
                setPending(true);
                try {
                  await action(fd);
                } finally {
                  setPending(false);
                  setOpen(false);
                }
              }}
            >
              {Object.entries(hidden).map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
              <button type="button" className="btn" onClick={() => setOpen(false)} disabled={pending} autoFocus>
                Cancel
              </button>
              <button type="submit" className={danger ? "btn danger" : "btn primary"} disabled={pending}>
                {pending ? "Working…" : confirmLabel}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
