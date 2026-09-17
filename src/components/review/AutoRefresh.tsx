"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Refreshes the page while AI marking runs in the background. */
export function AutoRefresh({ active, every = 5000 }: { active: boolean; every?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => router.refresh(), every);
    return () => window.clearInterval(t);
  }, [active, every, router]);
  return null;
}
