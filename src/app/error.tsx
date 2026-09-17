"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
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
        </div>
      </div>
    </main>
  );
}
