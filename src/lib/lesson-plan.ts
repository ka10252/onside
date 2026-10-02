import "server-only";
import { unitReview, type UnitReview } from "./unit-weight";

/**
 * The lessons left before the exam, each one a unit or two.
 *
 * Ordered by how much of the exam the lesson carries, which is what decides where a limited number
 * of lessons goes. The pairs are not arbitrary: each one is a pair the papers themselves set
 * together — counted across M22–N25, unit 10 appears with unit 13 in twenty questions, unit 3 with
 * unit 4 in fourteen, unit 19 with unit 20 in twelve. A pair is also a pair a tutor can recap
 * inside half an hour, which is why the heavier unit never shares with another heavy one.
 */
export const LESSONS: { units: number[]; why: string }[] = [
  { units: [13, 10], why: "Policies and the objectives they aim at — set in the same question 20 times" },
  { units: [16, 17], why: "Exchange rates and the accounts they move; 17.4 is 16's evaluation" },
  { units: [4, 3], why: "Intervention rests on elasticity — who bears a tax, how big the loss is" },
  { units: [8, 9], why: "Measuring the economy, then the model that explains it" },
  { units: [5, 2], why: "Market failure read off the demand and supply diagram" },
  { units: [7, 6], why: "Market power and the failures that justify intervening" },
  { units: [20, 19], why: "The barriers, then the strategies that answer them" },
  { units: [14, 15], why: "Trade and the arguments about protecting it" },
  { units: [12, 18], why: "Inequality and poverty, and how development is measured" },
  { units: [11, 1], why: "Growth and debt, with the introduction tidied up" },
];

export type PlannedLesson = {
  n: number;
  units: UnitReview[];
  why: string;
  /** Past-paper questions the lesson covers between its units. */
  items: number;
  /** Worth teaching sooner: it carries a lot and is going badly, or has never been tested. */
  urgency: number;
  urgent: boolean;
};

/** The plan with this student's standing in each unit, in the order the lessons should be taught. */
export async function plannedLessons(studentId: string): Promise<PlannedLesson[]> {
  const rows = await unitReview(studentId);
  const by = new Map(rows.map((r) => [r.unit, r]));
  return LESSONS.map(({ units, why }, i) => {
    const us = units.map((u) => by.get(u)).filter((u): u is UnitReview => Boolean(u));
    return {
      n: i + 1,
      units: us,
      why,
      items: us.reduce((n, u) => n + u.items, 0),
      urgency: us.reduce((n, u) => n + u.urgency, 0),
      urgent: false,
    };
  })
    .map((l, _, list) => ({ ...l, urgent: l.urgency >= [...list].sort((a, b) => b.urgency - a.urgency)[2]!.urgency }))
    .sort((a, b) => b.items - a.items);
}
