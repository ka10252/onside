import type { UnitWeight } from "@/lib/unit-weight";

/**
 * How much of the exam a unit carries, counted from the past papers held (M22–N25). The band is
 * which third of the twenty units it falls in, so a glance separates the ones worth the time.
 */
export function WeightPill({ w }: { w: Pick<UnitWeight, "items" | "rank" | "share" | "band"> }) {
  if (!w.items) return null;
  const label = { heavy: "Heavily examined", middling: "Middling", light: "Lightly examined" }[w.band];
  return (
    <span className={`pill weight ${w.band}`} title={`${w.items} past-paper questions · ${Math.round(w.share * 100)}% of all of them`}>
      #{w.rank} · {w.items} past · {label}
    </span>
  );
}

/** A bar of the unit's share of the exam, for a row that has space for one. */
export function WeightBar({ w, of }: { w: Pick<UnitWeight, "items" | "band">; of: number }) {
  return (
    <span className="weightbar" aria-hidden>
      <span className={`fill ${w.band}`} style={{ width: `${of > 0 ? Math.round((w.items / of) * 100) : 0}%` }} />
    </span>
  );
}
