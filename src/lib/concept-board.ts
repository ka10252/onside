import "server-only";
import { db } from "./db";
import { loadReview } from "./review";
import { conceptStatus, weakSpot, type ConceptRow, type ConceptStatus, type ScoredQuestion } from "./scoring";

// Concept status across sets (docs/scoring-rules.md): each concept is judged on the last 3 sets
// with sent marks that tested it (Jin, 2026-09-18).
export const BOARD_WINDOW = 3;

export type BoardSet = { assignmentId: string; title: string; date: string; status: ConceptStatus; got: number; available: number };

export type BoardRow = ConceptRow & {
  unitId: string;
  sets: BoardSet[]; // oldest first
  lastSeen: string;
};

export type BoardUnit = {
  id: string;
  number: number;
  title: string;
  rows: BoardRow[];
  untested: number;
  total: number;
};

type Entry = {
  label: string;
  sets: { assignmentId: string; title: string; date: string; qs: ScoredQuestion[]; labels: string[] }[];
};

export function conceptBoard(studentId: string) {
  const assignments = db()
    .prepare(
      `SELECT id FROM assignments WHERE student_id = ? AND status = 'reviewed'
        ORDER BY COALESCE(reviewed_at, submitted_at, assigned_at) DESC`,
    )
    .all(studentId) as { id: string }[];

  const entries = new Map<string, Entry>();
  for (const { id } of assignments) {
    const rv = loadReview(id);
    if (!rv) continue;
    const date = rv.a.reviewed_at ?? rv.a.submitted_at ?? "";
    rv.scored.forEach((q, i) => {
      if (q.confirmed === null) return;
      for (const c of q.concepts) {
        const e = entries.get(c.key) ?? { label: c.label, sets: [] };
        let set = e.sets.at(-1);
        if (set?.assignmentId !== id) {
          if (e.sets.length >= BOARD_WINDOW) continue; // older than the last 3 sets for this concept
          set = { assignmentId: id, title: rv.a.title, date, qs: [], labels: [] };
          e.sets.push(set);
        }
        set.qs.push({ ...q, concepts: [c] });
        set.labels.push(`${rv.a.title} Q${i + 1}`);
        entries.set(c.key, e);
      }
    });
  }

  const { unitOf, sectionOf } = lookups();
  const rows: BoardRow[] = [];
  for (const [key, e] of entries) {
    const sets = [...e.sets].reverse(); // oldest first
    const qs = sets.flatMap((s) => s.qs);
    const labels = sets.flatMap((s) => s.labels);
    const row = conceptStatus(qs, (i) => labels[i] ?? `Q${i + 1}`)[0];
    if (!row) continue;
    rows.push({
      ...row,
      label: e.label,
      unitId: unitOf(key),
      lastSeen: e.sets[0]!.date,
      sets: sets.map((s) => {
        const r = conceptStatus(s.qs)[0]!;
        return { assignmentId: s.assignmentId, title: s.title, date: s.date, status: r.status, got: r.got, available: r.available };
      }),
    });
  }

  const units = (
    db()
      .prepare(
        `SELECT u.id, u.number, u.title, (SELECT COUNT(*) FROM sections x WHERE x.unit_id = u.id) AS total
           FROM units u ORDER BY u.number`,
      )
      .all() as { id: string; number: number; title: string; total: number }[]
  )
    .map((u): BoardUnit => {
      const unitRows = rows.filter((r) => r.unitId === u.id);
      const tested = new Set(unitRows.map((r) => sectionOf(r.key)).filter(Boolean));
      return { ...u, rows: unitRows, untested: Math.max(0, u.total - tested.size) };
    })
    .filter((u) => u.rows.length > 0);

  const count = (s: ConceptStatus) => rows.filter((r) => r.status === s).length;
  return {
    sets: assignments.length,
    units,
    counts: { needs: count("needs"), shaky: count("shaky"), solid: count("solid") },
    weak: weakSpot(rows),
  };
}

export type ConceptBoard = ReturnType<typeof conceptBoard>;

function lookups() {
  const sections = new Map(
    (db().prepare("SELECT id, unit_id FROM sections").all() as { id: string; unit_id: string }[]).map((s) => [s.id, s.unit_id]),
  );
  const concepts = new Map(
    (db().prepare("SELECT id, unit_id, section_id FROM concepts").all() as { id: string; unit_id: string; section_id: string | null }[]).map(
      (c) => [c.id, c],
    ),
  );
  return {
    unitOf: (key: string) => (key.startsWith("s:") ? (sections.get(key.slice(2)) ?? "") : (concepts.get(key)?.unit_id ?? "")),
    sectionOf: (key: string) => (key.startsWith("s:") ? key.slice(2) : (concepts.get(key)?.section_id ?? "")),
  };
}
