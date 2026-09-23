"use client";

import { useSyncExternalStore } from "react";

// Vercel gives each deployment its own Server Action addresses. A page that was open when a new
// version went live gets 404s from then on. We can't stop that (Vercel's Skew Protection is a paid
// feature), so the page notices, keeps a copy of the answer in this browser, and asks for a refresh.

const KEY = (responseId: string) => `onside:draft:${responseId}`;

export function isStale(e: unknown): boolean {
  const err = e as { message?: string; digest?: string } | null;
  const text = `${err?.message ?? String(e)} ${err?.digest ?? ""}`;
  return /Failed to find Server Action|older or newer deployment|NEXT_NOT_FOUND|Unexpected response|Failed to fetch/i.test(text);
}

/** Tells the page to show the refresh notice. Returns true when this was a stale-deployment error. */
export function reportIfStale(e: unknown): boolean {
  if (!isStale(e)) return false;
  window.dispatchEvent(new Event("onside:stale"));
  return true;
}

export function keepBackup(responseId: string, value: unknown) {
  try {
    localStorage.setItem(KEY(responseId), JSON.stringify(value));
  } catch {
    // private window or full storage: the server copy is still the one that counts
  }
}

export function dropBackup(responseId: string) {
  try {
    localStorage.removeItem(KEY(responseId));
  } catch {
    // ignore
  }
}

/**
 * The answer this browser holds for a question, when the server never got it.
 * Read through useSyncExternalStore so the server and the browser render the same thing.
 */
export function useBackup<T>(responseId: string): T | null {
  const raw = useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return localStorage.getItem(KEY(responseId));
      } catch {
        return null;
      }
    },
    () => null,
  );
  try {
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
