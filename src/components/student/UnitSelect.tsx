"use client";

import { useRouter } from "next/navigation";

/**
 * Unit filter. Changing it goes straight to the filtered list.
 * `hrefs` maps a unit number (and "" for all units) to the page to open, because a server page
 * can hand a client component data but not functions.
 */
export function UnitSelect({
  units,
  value,
  hrefs,
  label = "Unit",
}: {
  units: { number: number; title: string }[];
  value: number | null;
  hrefs: Record<string, string>;
  label?: string;
}) {
  const router = useRouter();
  return (
    <label className="unitpick">
      <span>{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => {
          const href = hrefs[e.target.value];
          if (href) router.push(href);
        }}
      >
        <option value="">All units</option>
        {units.map((u) => (
          <option key={u.number} value={u.number}>
            Unit {u.number} · {u.title}
          </option>
        ))}
      </select>
    </label>
  );
}
