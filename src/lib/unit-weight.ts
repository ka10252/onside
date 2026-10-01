import "server-only";
import { memo } from "./cache";
import { all } from "./db";

/**
 * How heavily each unit is examined, counted from the past papers we hold (M22–N25). The ranking
 * is what decides where a lesson's time goes, so it is read from the papers rather than guessed.
 */
export type UnitWeight = {
  unit: number;
  /** Past-paper items tagged to this unit. */
  items: number;
  p1: number;
  p2: number;
  p3: number;
  /** 1 is the most examined unit. */
  rank: number;
  /** Share of all tagged past items, 0–1. */
  share: number;
  /** Which third of the ranking it falls in. */
  band: "heavy" | "middling" | "light";
};

export const unitWeights = memo(10 * 60_000, async (): Promise<UnitWeight[]> => {
  const rows = await all<{ unit: number; p1: number; p2: number; p3: number }>(
    `SELECT unit_number AS unit,
            COUNT(*) FILTER (WHERE paper = 1)::int AS p1,
            COUNT(*) FILTER (WHERE paper = 2)::int AS p2,
            COUNT(*) FILTER (WHERE paper = 3)::int AS p3
       FROM past_items WHERE unit_number IS NOT NULL GROUP BY 1`,
  );
  const total = rows.reduce((n, r) => n + r.p1 + r.p2 + r.p3, 0) || 1;
  return rows
    .map((r) => ({ ...r, items: r.p1 + r.p2 + r.p3 }))
    .sort((a, b) => b.items - a.items || a.unit - b.unit)
    .map((r, i, list) => ({
      ...r,
      rank: i + 1,
      share: r.items / total,
      band: i < list.length / 3 ? "heavy" : i < (list.length * 2) / 3 ? "middling" : ("light" as const),
    })) as UnitWeight[];
});

/** The weights keyed by unit number, for a page that looks them up one at a time. */
export async function weightByUnit(): Promise<Map<number, UnitWeight>> {
  return new Map((await unitWeights()).map((w) => [w.unit, w]));
}

export type UnitReview = UnitWeight & {
  title: string;
  /** Marks confirmed so far in this unit. */
  got: number;
  available: number;
  answered: number;
  status: "untouched" | "weak" | "shaky" | "solid";
  /** Exam weight against how the student is doing. Higher means review it sooner. */
  urgency: number;
  urgent: boolean;
};

/**
 * Units in the order they are worth reviewing: how heavily each is examined, weighed against how
 * the student is doing in it. A unit that carries a lot of the exam and has gone badly, or has
 * never been tested, comes first.
 */
export async function unitReview(studentId: string): Promise<UnitReview[]> {
  const [weights, rows] = await Promise.all([
    weightByUnit(),
    all<{ unit: number; title: string; got: number; available: number; answered: number }>(
      `SELECT u.number AS unit, u.title,
              COALESCE(SUM(CASE WHEN m.marks IS NULL THEN 0 ELSE LEAST(m.marks, q.marks) END), 0)::float AS got,
              COALESCE(SUM(CASE WHEN m.marks IS NULL THEN 0 ELSE q.marks END), 0)::int AS available,
              COUNT(*) FILTER (WHERE m.marks IS NOT NULL)::int AS answered
         FROM units u
         LEFT JOIN questions q ON q.unit_id = u.id
         LEFT JOIN LATERAL (
           SELECT COALESCE((r.tutor_mark::jsonb ->> 'marks')::float, r.auto_marks) AS marks
             FROM responses r
            WHERE r.question_id = q.id AND r.student_id = ? AND r.submitted_at IS NOT NULL
         ) m ON TRUE
        GROUP BY 1, 2 ORDER BY 1`,
      studentId,
    ),
  ]);
  return rows
    .map((r) => {
      const w = weights.get(r.unit) ?? { unit: r.unit, items: 0, p1: 0, p2: 0, p3: 0, rank: 99, share: 0, band: "light" as const };
      const share = r.available > 0 ? r.got / r.available : 0;
      const status: UnitReview["status"] = r.available === 0 ? "untouched" : share < 0.6 ? "weak" : share < 0.8 ? "shaky" : "solid";
      // An untested unit is treated as half-lost: it may be fine, but nothing says so yet.
      const missing = r.available === 0 ? 0.5 : 1 - share;
      return { ...w, title: r.title, got: r.got, available: r.available, answered: r.answered, status, urgency: w.share * missing, urgent: false };
    })
    .sort((a, b) => b.urgency - a.urgency || a.rank - b.rank)
    .map((r, i) => ({ ...r, urgent: i < 3 && r.band !== "light" && r.status !== "solid" }));
}
