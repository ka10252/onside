"use client";

import { useEffect, useState } from "react";

/**
 * A page that is taking unusually long says so, and offers the one thing that helps. Without this
 * a stalled load looks the same as a slow one: grey bars, forever.
 */
export function SlowNotice({ after = 6000 }: { after?: number }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), after);
    return () => clearTimeout(timer);
  }, [after]);
  if (!slow) return null;
  return (
    <p className="note" role="status" style={{ margin: 0 }}>
      This is taking longer than usual.{" "}
      <button type="button" className="link" onClick={() => window.location.reload()}>
        Reload the page
      </button>
    </p>
  );
}
