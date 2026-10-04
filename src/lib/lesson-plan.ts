import "server-only";
import { unitReview, type UnitReview } from "./unit-weight";
import { releasedUnits } from "./revision";

/**
 * The lessons left before the exam, each one a unit or two, with the units in the order they are
 * taught — the second unit of a pair is the one that builds on the first.
 *
 * Ordered by how much of the exam the lesson carries, which is what decides where a limited number
 * of lessons goes. The pairs are not arbitrary: each one is a pair the papers themselves set
 * together — counted across M22–N25, unit 10 appears with unit 13 in twenty questions, unit 3 with
 * unit 4 in fourteen, unit 19 with unit 20 in twelve. A pair is also a pair a tutor can recap
 * inside half an hour, which is why the heavier unit never shares with another heavy one.
 */
export const LESSONS: { units: number[]; why: string }[] = [
  { units: [13, 10], why: "Policies, and the objectives they are aimed at" },
  { units: [16, 17], why: "Exchange rates, and the accounts that move with them" },
  { units: [4, 3], why: "Intervention rests on elasticity: who bears a tax, and how big the loss is" },
  { units: [8, 9], why: "Measuring the economy, then the model that explains it" },
  { units: [2, 5], why: "The market first, then the failures read off the same diagram" },
  { units: [6, 7], why: "The failures that justify intervening, then market power itself" },
  { units: [19, 20], why: "The barriers, then the strategies that answer them" },
  { units: [14, 15], why: "Trade and the arguments about protecting it" },
  { units: [12, 18], why: "Inequality and poverty, and how development is measured" },
  { units: [11, 1], why: "Growth and debt, with the introduction tidied up" },
];

/** The lesson a unit belongs to, with the other units taught beside it. */
export function lessonOf(unit: number): { n: number; units: number[]; why: string } | null {
  const i = LESSONS.findIndex((l) => l.units.includes(unit));
  return i < 0 ? null : { n: i + 1, units: LESSONS[i]!.units, why: LESSONS[i]!.why };
}

/** Every unit taught in the same lesson as this one, so a lesson is one range of questions. */
export const unitsOfLesson = (unit: number | null): number[] => (unit === null ? [] : (lessonOf(unit)?.units ?? [unit]));

export type PlannedLesson = {
  n: number;
  units: UnitReview[];
  why: string;
  /** Past-paper questions the lesson covers between its units. */
  items: number;
  /** Worth teaching sooner: it carries a lot and is going badly, or has never been tested. */
  urgency: number;
  urgent: boolean;
  /** How many of the lesson's units the student can already read the notes for. */
  notesSent: number;
};

/** The plan with this student's standing in each unit, in the order the lessons should be taught. */
export async function plannedLessons(studentId: string): Promise<PlannedLesson[]> {
  const [rows, released] = await Promise.all([unitReview(studentId), releasedUnits(studentId)]);
  const by = new Map(rows.map((r) => [r.unit, r]));
  return LESSONS.map(({ units, why }, i) => {
    const us = units.map((u) => by.get(u)).filter((u): u is UnitReview => Boolean(u));
    return {
      n: i + 1,
      units: us,
      why,
      items: us.reduce((n, u) => n + u.items, 0),
      notesSent: units.filter((u) => released.has(u)).length,
      urgency: us.reduce((n, u) => n + u.urgency, 0),
      urgent: false,
    };
  })
    .map((l, _, list) => ({ ...l, urgent: l.urgency >= [...list].sort((a, b) => b.urgency - a.urgency)[2]!.urgency }))
    .sort((a, b) => b.items - a.items);
}
