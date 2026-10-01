import Link from "next/link";
import type { UnitReview } from "@/lib/unit-weight";
import { WeightBar } from "./UnitWeight";

const WORD = {
  untouched: "Never tested",
  weak: "Going badly",
  shaky: "Shaky",
  solid: "Holding up",
} as const;

/**
 * Which unit to teach next: how much of the exam each carries, against how this student is doing
 * in it. A unit that carries a lot and has gone badly — or has never been tested — comes first.
 */
export function UnitReviewBoard({ rows, studentId }: { rows: UnitReview[]; studentId: string }) {
  const most = Math.max(...rows.map((r) => r.items), 1);
  return (
    <div className="unitreview">
      {rows.map((r) => (
        <div key={r.unit} className="ur">
          <span className="num">{r.unit}</span>
          <span className="nm">
            {r.title}
            <span className="sub">
              {r.items} past-paper questions · #{r.rank} of 20
              <WeightBar w={r} of={most} />
            </span>
          </span>
          <span className="rowacts">
            {r.urgent && <span className="pill red">Review next</span>}
            <span className={`pill ${r.status === "solid" ? "green" : r.status === "weak" ? "amber" : "gray"}`}>{WORD[r.status]}</span>
          </span>
          <span className="rowacts">
            <span className="muted" style={{ fontSize: 13 }}>
              {r.available > 0 ? `${Math.round(r.got * 10) / 10}/${r.available} marks` : "—"}
            </span>
            <Link href={`/tutor/students/${studentId}/lesson?unit=${r.unit}`} className="btn ghost sm">
              Prepare
            </Link>
          </span>
        </div>
      ))}
    </div>
  );
}
