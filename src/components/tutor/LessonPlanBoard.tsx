import Link from "next/link";
import type { PlannedLesson } from "@/lib/lesson-plan";
import { WeightBar } from "./UnitWeight";

const WORD = { untouched: "Never tested", weak: "Going badly", shaky: "Shaky", solid: "Holding up" } as const;

/**
 * The lessons left, heaviest first. Each is a unit or two the papers set together and a tutor can
 * recap inside half an hour.
 */
export function LessonPlanBoard({ lessons, studentId }: { lessons: PlannedLesson[]; studentId: string }) {
  const most = Math.max(...lessons.map((l) => l.items), 1);
  return (
    <ol className="planlessons">
      {lessons.map((l, i) => (
        <li key={l.n} className={l.urgent ? "urgent" : undefined}>
          <span className="pos">{i + 1}</span>
          <div className="body">
            <div className="units">
              {l.units.map((u) => (
                <Link key={u.unit} href={`/tutor/students/${studentId}/lesson?unit=${u.unit}`} className="unit">
                  <b>
                    {u.unit} · {u.title}
                  </b>
                  <span className="sub">
                    {u.items} past · #{u.rank}
                    <span className={`pill ${u.status === "solid" ? "green" : u.status === "weak" ? "amber" : "gray"}`}>
                      {WORD[u.status]}
                    </span>
                  </span>
                  <WeightBar w={u} of={most} />
                </Link>
              ))}
            </div>
            <p className="why">{l.why}</p>
          </div>
          <div className="right">
            <span className="items">{l.items}</span>
            <span className="muted" style={{ fontSize: 12 }}>past questions</span>
            {l.urgent && <span className="pill red">Sooner</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}
