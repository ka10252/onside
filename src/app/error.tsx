"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isStale } from "@/components/stale";

const DONE = "onside:recovered-at";
const QUIET_MS = 20_000;

/** True the first time in a while, so a recovery is tried once and never loops. */
function onceInAWhile(key: string): boolean {
  try {
    const last = Number(sessionStorage.getItem(key) ?? 0);
    if (Date.now() - last < QUIET_MS) return false;
    sessionStorage.setItem(key, String(Date.now()));
    return true;
  } catch {
    return false; // private window: the buttons below still work
  }
}

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const stale = isStale(error);
  // Most failures here are a connection that died while this serverless instance was asleep, and
  // asking again lands on a fresh one. So try that first: a blink rather than a dead end. A page
  // left behind by a new deployment needs the whole page reloaded instead.
  const [recovering] = useState(() => typeof window !== "undefined" && onceInAWhile(stale ? `${DONE}:stale` : DONE));
  useEffect(() => {
    if (!recovering) return;
    if (stale) window.location.reload();
    else reset();
  }, [recovering, stale, reset]);

  if (recovering) return null; // a flash of an error screen we are about to clear helps nobody

  if (stale) {
    return (
      <Sheet title="This page is out of date">
        <p className="muted">
          A new version of Onside went live while this page was open, so that didn&apos;t go through. Refresh and do it again.
        </p>
        <div className="actions-row" style={{ justifyContent: "center" }}>
          <button type="button" className="btn primary" onClick={() => window.location.reload()}>
            Refresh
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title="That didn&rsquo;t load">
      <p className="muted">Your saved work is safe. Try again — it usually works the second time.</p>
      <div className="actions-row" style={{ justifyContent: "center" }}>
        <button type="button" className="btn primary" onClick={reset}>Try again</button>
        <Link href="/" className="btn">Go to the start</Link>
      </div>
      {error.digest && (
        // The code the server logged this under, so a report can be matched to the entry.
        <p className="muted" style={{ marginTop: 14, fontSize: 13 }}>Code {error.digest}</p>
      )}
    </Sheet>
  );
}

function Sheet({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="page">
      <div className="narrow">
        <div className="card empty-state">
          <h1 className="serif" style={{ margin: 0, fontSize: 36, fontWeight: 400 }}>{title}</h1>
          {children}
        </div>
      </div>
    </main>
  );
}
