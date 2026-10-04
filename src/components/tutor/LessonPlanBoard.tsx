import Link from "next/link";
import type { PlannedLesson } from "@/lib/lesson-plan";

const WORD = { untouched: "Never tested", weak: "Going badly", shaky: "Shaky", solid: "Holding up" } as const;
const TONE = { untouched: "gray", weak: "amber", shaky: "amber", solid: "green" } as const;
/** Worst first: a lesson is as weak as its weaker unit. */
const ORDER = { weak: 0, untouched: 1, shaky: 2, solid: 3 } as const;

/**
 * The lessons left, heaviest first. One row is one lesson, and the row opens it: a lesson that
 * covers two units is one screen, so there is nothing to choose between them here.
 */
export function LessonPlanBoard({ lessons, studentId }: { lessons: PlannedLesson[]; studentId: string }) {
  const most = Math.max(...lessons.map((l) => l.items), 1);
  return (
    <ol className="planlessons">
      {lessons.map((l, i) => {
        const state = [...l.units].sort((a, b) => ORDER[a.status] - ORDER[b.status])[0]?.status ?? "untouched";
        return (
          <li key={l.n}>
            <Link href={`/tutor/students/${studentId}/lesson?unit=${l.units[0]?.unit ?? ""}`} className="row">
              <span className="pos">{i + 1}</span>
              <span className="main">
                <span className="line">
                  <b>Units {l.units.map((u) => u.unit).join(" + ")}</b>
                  <span className={`pill ${TONE[state]}`}>{WORD[state]}</span>
                  {l.urgent && <span className="pill red">Sooner</span>}
                  {l.notesSent > 0 && (
                    <span className="pill gray">
                      Notes sent{l.notesSent < l.units.length ? ` · ${l.notesSent} of ${l.units.length}` : ""}
                    </span>
                  )}
                </span>
                <span className="titles">{l.units.map((u) => u.title).join(" · ")}</span>
                <span className="reason">{l.why}</span>
              </span>
              <span className="count">
                <b>{l.items}</b>
                <span>questions</span>
                <span className="weightbar" aria-hidden>
                  <span className="fill" style={{ width: `${Math.round((l.items / most) * 100)}%` }} />
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
