"use client";

import { useEffect, useState } from "react";

/**
 * Vercel gives each deployment its own Server Action addresses, so a page left open when a new
 * version goes live can no longer save anything. This watches for that and says so, before a
 * button press turns into an error. Any screen can also raise it with reportIfStale().
 */
export function StaleBar() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const onStale = () => setStale(true);
    window.addEventListener("onside:stale", onStale);
    return () => window.removeEventListener("onside:stale", onStale);
  }, []);

  useEffect(() => {
    if (stale) return;
    let mine: string | null = null;
    let live = true;
    const look = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        const { id } = (await res.json()) as { id: string };
        if (!live || !id || id === "dev") return;
        if (mine === null) mine = id;
        else if (id !== mine) setStale(true);
      } catch {
        // offline or between deployments: try again on the next turn
      }
    };
    void look();
    const timer = setInterval(look, 60_000);
    document.addEventListener("visibilitychange", look);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", look);
    };
  }, [stale]);

  if (!stale) return null;
  return (
    <div className="stalebar" role="alert">
      <span>A new version of Onside is live. Refresh before you save anything, or it won&apos;t go through.</span>
      <button type="button" className="btn sm" onClick={() => window.location.reload()}>
        Refresh
      </button>
    </div>
  );
}
