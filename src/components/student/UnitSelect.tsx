"use client";

import { useRouter } from "next/navigation";

/** Unit filter. Changing it goes straight to the filtered list. */
export function UnitSelect({
  units,
  value,
  hrefFor,
  label = "Unit",
}: {
  units: { number: number; title: string }[];
  value: number | null;
  hrefFor: (unit: number | null) => string;
  label?: string;
}) {
  const router = useRouter();
  return (
    <label className="unitpick">
      <span>{label}</span>
      <select value={value ?? ""} onChange={(e) => router.push(hrefFor(e.target.value ? Number(e.target.value) : null))}>
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
