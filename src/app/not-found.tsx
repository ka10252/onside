import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page">
      <div className="narrow">
        <div className="card empty-state">
          <h1 className="serif" style={{ margin: 0, fontSize: 36, fontWeight: 400 }}>Page not found</h1>
          <p className="muted">It may have been removed, or the link is wrong.</p>
          <Link href="/" className="btn primary">Go to the start</Link>
        </div>
      </div>
    </main>
  );
}
