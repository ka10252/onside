import "server-only";
import { hasAnswerSql } from "./answered";
import { all, one } from "./db";
import type { Format } from "./content";

export type AssignmentStatus = "not_started" | "in_progress" | "submitted" | "reviewed";

export type StudentRow = {
  id: string;
  name: string;
  subtitle: string | null;
  archived_at: string | null;
  username: string | null;
  set_title: string | null;
  status: AssignmentStatus | null;
  answered: number;
  total: number;
  open_count: number;
  pending_review: number;
  oldest_submitted: string | null;
};

export function listStudents(): Promise<StudentRow[]> {
  return all<StudentRow>(
      `SELECT u.id, u.name, u.subtitle, u.archived_at, u.username, s.title AS set_title, a.status,
              (SELECT COUNT(*) FROM responses r WHERE r.assignment_id = a.id AND ${hasAnswerSql()}) AS answered,
              (SELECT COUNT(*) FROM set_items i WHERE i.set_id = a.set_id) AS total,
              (SELECT COUNT(*) FROM assignments x WHERE x.student_id = u.id AND x.status IN ('not_started', 'in_progress')) AS open_count,
              (SELECT COUNT(*) FROM assignments x WHERE x.student_id = u.id AND x.status = 'submitted') AS pending_review,
              (SELECT x.id FROM assignments x WHERE x.student_id = u.id AND x.status = 'submitted' ORDER BY x.submitted_at LIMIT 1) AS oldest_submitted
         FROM users u
         LEFT JOIN assignments a ON a.id = (
           SELECT id FROM assignments WHERE student_id = u.id ORDER BY assigned_at DESC LIMIT 1)
         LEFT JOIN sets s ON s.id = a.set_id
        WHERE u.role = 'student'
        ORDER BY u.archived_at IS NOT NULL, lower(u.name)`,
  );
}

export type Student = { id: string; name: string; subtitle: string | null; archived_at: string | null; username: string | null };

export async function getStudent(id: string): Promise<Student | null> {
  return (await one<Student>("SELECT id, name, subtitle, archived_at, username FROM users WHERE id = ? AND role = 'student'", id)) ?? null;
}

export type AssignmentRow = {
  id: string;
  set_id: string;
  set_title: string;
  student_id: string;
  student_name: string;
  status: AssignmentStatus;
  due_at: string | null;
  assigned_at: string;
  submitted_at: string | null;
  answered: number;
  total: number;
  marks_got: number;
  marks_total: number;
};

const ASSIGNMENT_SELECT = `
  SELECT a.id, a.set_id, s.title AS set_title, a.student_id, u.name AS student_name, a.status,
         a.due_at, a.assigned_at, a.submitted_at,
         (SELECT COUNT(*) FROM responses r WHERE r.assignment_id = a.id AND ${hasAnswerSql()}) AS answered,
         (SELECT COUNT(*) FROM set_items i WHERE i.set_id = a.set_id) AS total,
         (SELECT COALESCE(SUM(q.marks), 0) FROM set_items i JOIN questions q ON q.id = i.question_id WHERE i.set_id = a.set_id) AS marks_total,
         (SELECT COALESCE(SUM(COALESCE((r.tutor_mark::jsonb ->> 'marks')::float, r.auto_marks, 0)), 0)
            FROM responses r WHERE r.assignment_id = a.id) AS marks_got
    FROM assignments a
    JOIN sets s ON s.id = a.set_id
    JOIN users u ON u.id = a.student_id`;

export function assignmentsForStudent(studentId: string): Promise<AssignmentRow[]> {
  return all<AssignmentRow>(`${ASSIGNMENT_SELECT} WHERE a.student_id = ? ORDER BY a.assigned_at DESC`, studentId);
}

export function assignmentsForSet(setId: string): Promise<AssignmentRow[]> {
  return all<AssignmentRow>(`${ASSIGNMENT_SELECT} WHERE a.set_id = ? ORDER BY lower(u.name)`, setId);
}

export type SetRow = {
  id: string;
  title: string;
  helper: "on" | "off";
  time_limit_min: number | null;
  created_at: string;
  question_count: number;
  marks: number;
  assigned: number;
  submitted: number;
  preset: string | null;
  review_of: string | null;
};

export function listSets(): Promise<SetRow[]> {
  return all<SetRow>(
      `SELECT s.id, s.title, s.helper, s.time_limit_min, s.created_at, s.preset, s.review_of,
              (SELECT COUNT(*) FROM set_items i WHERE i.set_id = s.id) AS question_count,
              (SELECT COALESCE(SUM(q.marks), 0) FROM set_items i JOIN questions q ON q.id = i.question_id WHERE i.set_id = s.id) AS marks,
              (SELECT COUNT(*) FROM assignments a WHERE a.set_id = s.id) AS assigned,
              (SELECT COUNT(*) FROM assignments a WHERE a.set_id = s.id AND a.status IN ('submitted', 'reviewed')) AS submitted
         FROM sets s
        WHERE s.mode = 'assigned'
        ORDER BY s.preset IS NOT NULL, CASE WHEN s.preset IS NULL THEN s.created_at END DESC, s.id`,
  );
}

export type BankQuestion = {
  id: string;
  unit_number: number;
  unit_title: string;
  section_id: string | null;
  format: Format;
  paper_style: string | null;
  command_term: string | null;
  marks: number;
  prompt: string;
  targets: string;
  source: string;
  past_label: string | null;
  part_id: string;
  level: string | null; // HL | SL | HLSL for past items
  session: string | null; // M24
  skill: string | null;
};

const BANK_SELECT = `
  SELECT q.id, u.number AS unit_number, u.title AS unit_title, q.section_id, q.format, q.paper_style,
         q.command_term, q.marks, q.prompt, ((q.data::jsonb) -> 'targets')::text AS targets,
         q.source, (q.data::jsonb) #>> '{past,label}' AS past_label,
         u.part_id, p.level, p.session, p.skill
    FROM questions q JOIN units u ON u.id = q.unit_id
    LEFT JOIN past_items p ON q.source = 'past' AND p.id = substr(q.id, 4)`;

export async function bankParts(): Promise<{ id: string; name: string; units: { number: number; title: string }[] }[]> {
  const [parts, units] = await Promise.all([
    all<{ id: string; name: string }>("SELECT id, name FROM parts ORDER BY sort"),
    all<{ number: number; title: string; part_id: string }>("SELECT number, title, part_id FROM units ORDER BY number"),
  ]);
  return parts.map((p) => ({ ...p, units: units.filter((u) => u.part_id === p.id) }));
}

/** Approved questions; `withDrafts` also returns AI drafts (for the builder right after generating). */
export function bankQuestions(withDrafts = false): Promise<BankQuestion[]> {
  return all<BankQuestion>(
    `${BANK_SELECT} WHERE q.approved_by_tutor = 1 ${withDrafts ? "OR q.source = 'ai'" : ""}
      ORDER BY u.number, q.source = 'past', q.seq`,
  );
}

export type SetDetail = SetRow & { items: BankQuestion[] };

export async function getSet(id: string): Promise<SetDetail | null> {
  const set = (await listSets()).find((s) => s.id === id);
  if (!set) return null;
  const items = await all<BankQuestion>(`${BANK_SELECT} JOIN set_items i ON i.question_id = q.id WHERE i.set_id = ? ORDER BY i.position`, id);
  return { ...set, items };
}

/** A set can be edited or deleted only while nobody has started it. */
export async function setIsLocked(setId: string): Promise<boolean> {
  const row = await one<{ n: number }>("SELECT COUNT(*) AS n FROM assignments WHERE set_id = ? AND status <> 'not_started'", setId);
  return (row?.n ?? 0) > 0;
}
