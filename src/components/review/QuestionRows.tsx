"use client";

import { useState, type ReactNode } from "react";

// Expandable question rows (demo .qrow / .detail). Server renders the content; this only toggles.
export function QuestionRow({ head, children, open: initial = false }: { head: ReactNode; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(initial);
  return (
    <>
      <button type="button" className={`qrow${open ? " open" : ""}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {head}
        <svg className="chev" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M4 6l4 4 4-4" stroke="#141414" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && <div className="detail">{children}</div>}
    </>
  );
}

export function Reveal({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" className="btn sm" onClick={() => setOpen((o) => !o)}>
        {open ? `Hide ${label}` : `Show ${label}`}
      </button>
      {open && <div style={{ marginTop: 12 }}>{children}</div>}
    </div>
  );
}
