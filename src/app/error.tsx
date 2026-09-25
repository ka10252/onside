"use client";

import Link from "next/link";
import { useEffect } from "react";
import { isStale } from "@/components/stale";

const RELOADED = "onside:reloaded-at";

/** Reloads once for a page that a new deployment left behind, but never in a loop. */
function useReloadOnce(should: boolean) {
  useEffect(() => {
    if (!should) return;
    let last = 0;
    try {
      last = Number(sessionStorage.getItem(RELOADED) ?? 0);
    } catch {
      // private window: fall back to the button
    }
    if (Date.now() - last < 20_000) return;
    try {
      sessionStorage.setItem(RELOADED, String(Date.now()));
    } catch {
      // ignore
    }
    window.location.reload();
  }, [should]);
}

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // A page open while a new version went live can't reach the server any more; a refresh fixes it,
  // so take it once without asking and only show this if that didn't help.
  const stale = isStale(error);
  useReloadOnce(stale);
  if (stale) {
    return (
      <main className="page">
        <div className="narrow">
          <div className="card empty-state">
            <h1 className="serif" style={{ margin: 0, fontSize: 36, fontWeight: 400 }}>This page is out of date</h1>
            <p className="muted">
              A new version of Onside went live while this page was open, so that didn&apos;t go through. Refresh and do it
              again.
            </p>
            <div className="actions-row" style={{ justifyContent: "center" }}>
              <button type="button" className="btn primary" onClick={() => window.location.reload()}>
                Refresh
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }
  return (
    <main className="page">
      <div className="narrow">
        <div className="card empty-state">
          <h1 className="serif" style={{ margin: 0, fontSize: 36, fontWeight: 400 }}>Something went wrong</h1>
          <p className="muted">Your saved work is safe. Try again, or go back to the start.</p>
          <div className="actions-row" style={{ justifyContent: "center" }}>
            <button type="button" className="btn primary" onClick={reset}>Try again</button>
            <Link href="/" className="btn">Go to the start</Link>
          </div>
          {error.digest && (
            // The code the server logged this under, so a report can be matched to the entry.
            <p className="muted" style={{ marginTop: 14, fontSize: 13 }}>
              Code {error.digest}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
