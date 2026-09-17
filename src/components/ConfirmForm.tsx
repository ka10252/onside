"use client";

import { useState, type ReactNode } from "react";

/** A button that asks first, then submits a server action. */
export function ConfirmForm({
  action,
  hidden = {},
  label,
  title,
  body,
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
  confirmLabel: string;
  className?: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} disabled={disabled}>
        {label}
      </button>
      {open && (
        <div className="scrim" role="dialog" aria-modal="true" aria-label={title} onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
          <form
            className="dialog"
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
            <h2>{title}</h2>
            <p>{body}</p>
            <div className="acts">
              <button type="button" className="btn" onClick={() => setOpen(false)} autoFocus>
                Cancel
              </button>
              <button type="submit" className={danger ? "btn danger" : "btn primary"} disabled={pending}>
                {pending ? "Working…" : confirmLabel}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
