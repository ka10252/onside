"use client";

import { useCallback, useEffect, useRef } from "react";

// Logs pastes, time away from the tab and active time for one response.
// Batches are sent every 15 s and with sendBeacon when the page is hidden.
export function useActivity(responseId: string, enabled: boolean) {
  const pending = useRef({ pastes: [] as { field: string; chars: number }[], blurs: 0, awayMs: 0, activeMs: 0 });
  const awaySince = useRef<number | null>(null);
  const activeSince = useRef<number | null>(null);
  // Choosing a photo opens a system dialog, which blurs the window. That isn't leaving the tab.
  const paused = useRef(false);

  const flush = useCallback(
    (beacon = false) => {
      const p = pending.current;
      const now = Date.now();
      if (activeSince.current !== null) {
        p.activeMs += now - activeSince.current;
        activeSince.current = document.visibilityState === "visible" ? now : null;
      }
      if (!p.pastes.length && !p.blurs && !p.awayMs && p.activeMs < 1000) return;
      const body = JSON.stringify({ responseId, ...p });
      pending.current = { pastes: [], blurs: 0, awayMs: 0, activeMs: 0 };
      if (beacon && navigator.sendBeacon) {
        navigator.sendBeacon("/api/student/activity", new Blob([body], { type: "application/json" }));
      } else {
        void fetch("/api/student/activity", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true });
      }
    },
    [responseId],
  );

  useEffect(() => {
    if (!enabled) return;
    activeSince.current = document.visibilityState === "visible" ? Date.now() : null;
    const leave = () => {
      if (paused.current || awaySince.current !== null) return;
      awaySince.current = Date.now();
      pending.current.blurs += 1;
      if (activeSince.current !== null) {
        pending.current.activeMs += Date.now() - activeSince.current;
        activeSince.current = null;
      }
      flush(true);
    };
    const back = () => {
      paused.current = false;
      if (awaySince.current !== null) {
        pending.current.awayMs += Date.now() - awaySince.current;
        awaySince.current = null;
      }
      if (activeSince.current === null) activeSince.current = Date.now();
    };
    const onVisibility = () => (document.visibilityState === "hidden" ? leave() : back());
    window.addEventListener("blur", leave);
    window.addEventListener("focus", back);
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(() => flush(), 15_000);
    const onHide = () => flush(true);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("blur", leave);
      window.removeEventListener("focus", back);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
      window.clearInterval(timer);
      back();
      flush(true);
    };
  }, [enabled, flush]);

  /** onPaste handler for an answer field. */
  const onPaste = useCallback(
    (field: string) => (e: React.ClipboardEvent) => {
      const text = e.clipboardData.getData("text");
      if (text) pending.current.pastes.push({ field, chars: text.length });
    },
    [],
  );

  const pauseTracking = useCallback(() => {
    paused.current = true;
    window.setTimeout(() => (paused.current = false), 120_000); // safety net if focus never fires
  }, []);

  return { onPaste, pauseTracking };
}
