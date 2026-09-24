import "server-only";

/**
 * Keeps the result of a slow read in memory for a while, per server instance.
 * Only for content that changes when the tutor seeds or edits questions, never for a student's work.
 */
export function memo<T>(ttlMs: number, load: () => Promise<T>): () => Promise<T> {
  let at = 0;
  let held: Promise<T> | null = null;
  return () => {
    if (!held || Date.now() - at > ttlMs) {
      at = Date.now();
      held = load().catch((e) => {
        held = null;
        throw e;
      });
    }
    return held;
  };
}
