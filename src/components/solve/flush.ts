// Pending answer saves. Moving to another question or submitting waits for these first.
const savers = new Set<() => Promise<unknown>>();

export function registerSaver(fn: () => Promise<unknown>) {
  savers.add(fn);
  return () => {
    savers.delete(fn);
  };
}

export async function flushAll() {
  await Promise.all([...savers].map((fn) => fn().catch(() => {})));
}
