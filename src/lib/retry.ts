import "server-only";
import { bankQuestions, type BankQuestion } from "./admin";
import { sameQuestionKey, skillOf } from "./bank-filter";
import { isPast, type Question } from "./content";
import { all } from "./db";
import { loadReview } from "./review";

// Review quiz: every question the student lost marks on, needed help with, or left blank
// comes back as a *different* question on the same concept (docs/decisions.md).

export type Proposal = {
  n: number;
  questionId: string;
  prompt: string;
  label: string | null;
  marks: number;
  got: number | null;
  reason: string;
  unit: number;
  candidates: BankQuestion[];
};

export async function proposals(assignmentId: string): Promise<Proposal[]> {
  const rv = await loadReview(assignmentId);
  if (!rv) return [];
  const [seenRows, bank, links, units] = await Promise.all([
    all<{ question_id: string }>("SELECT DISTINCT question_id FROM responses WHERE student_id = ?", rv.a.student_id),
    bankQuestions(),
    all<{ question_id: string; concept_id: string }>("SELECT question_id, concept_id FROM question_concepts"),
    all<{ id: string; number: number }>(
      "SELECT q.id, u.number FROM set_items i JOIN questions q ON q.id = i.question_id JOIN units u ON u.id = q.unit_id WHERE i.set_id = ?",
      rv.a.set_id,
    ),
  ]);
  const seen = new Set(seenRows.map((r) => r.question_id));
  const byId = new Map(bank.map((q) => [q.id, q]));
  const byConcept = new Map<string, string[]>();
  for (const l of links) byConcept.set(l.concept_id, [...(byConcept.get(l.concept_id) ?? []), l.question_id]);
  const unitOf = new Map(units.map((u) => [u.id, u.number]));
  const taken = new Set<string>();

  const out: Proposal[] = [];
  rv.items.forEach((it, i) => {
    const s = rv.score.questions[i]!;
    const lost = it.confirmed !== null && it.confirmed < it.q.marks;
    const helped = s.category === "with_ai" || s.category === "unverified";
    const blank = s.category === "no_answer";
    if (!lost && !helped && !blank) return;
    const reason = blank
      ? "No answer"
      : lost
        ? `${it.confirmed}/${it.q.marks} marks${helped ? " · with help" : ""}`
        : s.category === "unverified"
          ? "Full marks · unverified"
          : "Full marks · with help";

    const q = it.q as Question;
    const self = byId.get(q.id);
    const skill = self ? skillOf(self) : null;
    const unit = unitOf.get(q.id) ?? 0;
    const pool = new Map<string, number>(); // id -> rank (lower is better)
    const add = (qs: BankQuestion[], rank: number) => {
      for (const c of qs) if (!pool.has(c.id)) pool.set(c.id, rank);
    };
    if (!isPast(q) && q.concepts.length) {
      const ids = new Set(q.concepts.flatMap((c) => byConcept.get(c) ?? []));
      add(bank.filter((c) => ids.has(c.id)), 0);
    }
    if (q.section) {
      add(bank.filter((c) => c.section_id === q.section && skillOf(c) === skill), 1);
      add(bank.filter((c) => c.section_id === q.section), 2);
    }
    add(bank.filter((c) => c.unit_number === unit && skillOf(c) === skill), 3);
    add(bank.filter((c) => c.unit_number === unit), 4);

    const ownKey = self ? sameQuestionKey(self) : "";
    const keys = new Set<string>([ownKey]);
    const candidates = [...pool.entries()]
      .map(([id, rank]) => ({ c: byId.get(id)!, rank }))
      .filter(({ c }) => c.id !== q.id && !seen.has(c.id))
      .sort((a, b) => a.rank - b.rank || (b.c.session ?? "").localeCompare(a.c.session ?? ""))
      .map(({ c }) => c)
      .filter((c) => {
        const k = sameQuestionKey(c);
        if (keys.has(k)) return false;
        keys.add(k);
        return true;
      });
    // Prefer a first choice no other proposal has taken.
    const first = candidates.findIndex((c) => !taken.has(c.id));
    if (first > 0) candidates.unshift(...candidates.splice(first, 1));
    if (candidates[0]) taken.add(candidates[0].id);

    out.push({
      n: it.n,
      questionId: q.id,
      prompt: q.prompt,
      label: isPast(q) ? q.past.label : null,
      marks: q.marks,
      got: it.confirmed,
      reason,
      unit,
      candidates: candidates.slice(0, 8),
    });
  });
  return out;
}
