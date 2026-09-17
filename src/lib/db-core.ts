// Shared by the app and scripts/ (no server-only import here).
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

// Local SQLite file. /data is git-ignored.
export const DATA_DIR = path.join(process.cwd(), "data");
export const DB_PATH = process.env.ONSIDE_DB ?? path.join(DATA_DIR, "onside.db");

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id        TEXT PRIMARY KEY,
  role      TEXT NOT NULL CHECK (role IN ('tutor', 'student')),
  name      TEXT NOT NULL,
  subtitle  TEXT,
  archived_at TEXT
);

-- Sign-in sessions. The cookie holds a random token; only its SHA-256 is stored.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at  TEXT NOT NULL
);

-- Content: Part -> Unit -> Section -> Concept -> Question
CREATE TABLE IF NOT EXISTS parts (
  id    TEXT PRIMARY KEY,           -- 'micro' | 'macro' | 'global' | 'development'
  name  TEXT NOT NULL,
  sort  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS units (
  id                  TEXT PRIMARY KEY,   -- 'ch16'
  number              INTEGER NOT NULL UNIQUE,
  part_id             TEXT NOT NULL REFERENCES parts(id),
  title               TEXT NOT NULL,
  concept_extraction  TEXT,               -- 'ok' | 'thin'
  exam_weight         TEXT,
  has_pack            INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sections (
  id       TEXT PRIMARY KEY,              -- '16.1'
  unit_id  TEXT NOT NULL REFERENCES units(id),
  title    TEXT NOT NULL,
  hl_only  INTEGER NOT NULL DEFAULT 0,
  sort     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS concepts (
  id          TEXT PRIMARY KEY,
  unit_id     TEXT NOT NULL REFERENCES units(id),
  section_id  TEXT REFERENCES sections(id),
  term        TEXT NOT NULL,
  definition  TEXT,
  source      TEXT NOT NULL              -- 'pack' | 'notes'
);

-- Full question JSON (docs/question-schema.md) in data; common fields copied out for queries.
CREATE TABLE IF NOT EXISTS questions (
  id                 TEXT PRIMARY KEY,
  unit_id            TEXT NOT NULL REFERENCES units(id),
  section_id         TEXT,
  format             TEXT NOT NULL CHECK (format IN ('mcq','short_answer','calculation','diagram','analysis_chain','essay')),
  paper_style        TEXT,
  command_term       TEXT,
  marks              INTEGER NOT NULL,
  prompt             TEXT NOT NULL,
  data               TEXT NOT NULL,
  source             TEXT NOT NULL DEFAULT 'original',
  approved_by_tutor  INTEGER NOT NULL DEFAULT 1,
  variant_of         TEXT REFERENCES questions(id)
);

CREATE TABLE IF NOT EXISTS question_concepts (
  question_id  TEXT NOT NULL REFERENCES questions(id),
  concept_id   TEXT NOT NULL REFERENCES concepts(id),
  PRIMARY KEY (question_id, concept_id)
);

CREATE TABLE IF NOT EXISTS diagram_checklists (
  id       TEXT PRIMARY KEY,
  unit_id  TEXT NOT NULL REFERENCES units(id),
  name     TEXT NOT NULL,
  data     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS note_corrections (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id  TEXT NOT NULL REFERENCES units(id),
  location TEXT NOT NULL,
  issue    TEXT NOT NULL
);

-- Past-paper pointers only. No question or mark scheme text.
CREATE TABLE IF NOT EXISTS past_items (
  id            TEXT PRIMARY KEY,
  session       TEXT NOT NULL,
  paper         INTEGER NOT NULL,
  level         TEXT NOT NULL,
  tz            TEXT,
  question      TEXT NOT NULL,
  marks         INTEGER,
  command_term  TEXT,
  diagram_type  TEXT,
  part          TEXT,
  unit_number   INTEGER,
  defined_term  TEXT,
  qp_file       TEXT,
  qp_page       INTEGER,
  ms_file       TEXT,
  ms_page       INTEGER
);

CREATE TABLE IF NOT EXISTS unit_past_items (
  unit_id       TEXT NOT NULL REFERENCES units(id),
  group_name    TEXT NOT NULL,
  past_item_id  TEXT NOT NULL,
  PRIMARY KEY (unit_id, group_name, past_item_id)
);

-- Past-paper text extracted locally (scripts/extract_past_papers.py). Local DB only, never committed.
CREATE TABLE IF NOT EXISTS past_papers (
  id          TEXT PRIMARY KEY,         -- 'M24-P2-HLSL-TZ1'
  session     TEXT NOT NULL,
  paper       INTEGER NOT NULL,
  level       TEXT NOT NULL,
  tz          TEXT,
  qp_file     TEXT,
  ms_file     TEXT,
  ms_general  TEXT                      -- JSON array of paragraphs (markbands, notes for examiners)
);

CREATE TABLE IF NOT EXISTS past_questions (
  paper_id  TEXT NOT NULL REFERENCES past_papers(id),
  number    TEXT NOT NULL,
  context   TEXT NOT NULL DEFAULT '[]', -- JSON blocks: {type:'text',text} | {type:'image',src,caption}
  PRIMARY KEY (paper_id, number)
);

-- Hints Jin edited in the app. Survive re-seeding.
CREATE TABLE IF NOT EXISTS hint_overrides (
  question_id  TEXT PRIMARY KEY,
  hint1        TEXT NOT NULL,
  hint2        TEXT NOT NULL,
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Half-price AI batches (marking). One row per submitted batch.
CREATE TABLE IF NOT EXISTS ai_batches (
  id             TEXT PRIMARY KEY,
  assignment_id  TEXT NOT NULL,
  response_ids   TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending',
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Sets and assignments
CREATE TABLE IF NOT EXISTS sets (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  mode           TEXT NOT NULL CHECK (mode IN ('assigned', 'review')),
  helper         TEXT NOT NULL DEFAULT 'on' CHECK (helper IN ('on', 'off')),
  time_limit_min INTEGER,
  created_by     TEXT NOT NULL REFERENCES users(id),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS set_items (
  set_id       TEXT NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL,
  question_id  TEXT NOT NULL REFERENCES questions(id),
  PRIMARY KEY (set_id, position)
);

CREATE TABLE IF NOT EXISTS assignments (
  id            TEXT PRIMARY KEY,
  set_id        TEXT NOT NULL REFERENCES sets(id),
  student_id    TEXT NOT NULL REFERENCES users(id),
  status        TEXT NOT NULL DEFAULT 'not_started'
                CHECK (status IN ('not_started', 'in_progress', 'submitted', 'reviewed')),
  due_at        TEXT,
  assigned_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  started_at    TEXT,
  submitted_at  TEXT,
  reviewed_at   TEXT
);

-- One row per student per question per assignment.
CREATE TABLE IF NOT EXISTS responses (
  id             TEXT PRIMARY KEY,
  assignment_id  TEXT NOT NULL REFERENCES assignments(id),
  student_id     TEXT NOT NULL REFERENCES users(id),
  question_id    TEXT NOT NULL REFERENCES questions(id),
  mode           TEXT NOT NULL CHECK (mode IN ('assigned', 'review')),
  attempts       TEXT NOT NULL DEFAULT '[]',   -- [{value, at, correct}]
  working_text   TEXT,
  final_text     TEXT,
  plan_text      TEXT,
  photo_path     TEXT,
  ai_mark        TEXT,                          -- JSON, never shown to the student
  tutor_mark     TEXT,                          -- JSON {marks, note, confirmed_at}
  auto_marks     REAL,
  hint_level     INTEGER NOT NULL DEFAULT 0,
  ai_questions   INTEGER NOT NULL DEFAULT 0,
  flags          TEXT NOT NULL DEFAULT '[]',   -- ["paste", "tab_away", "fast_complete"]
  paste_chars    INTEGER NOT NULL DEFAULT 0,
  away_ms        INTEGER NOT NULL DEFAULT 0,
  blur_count     INTEGER NOT NULL DEFAULT 0,
  active_ms      INTEGER NOT NULL DEFAULT 0,
  helper_opened_at TEXT,
  submitted_at   TEXT,
  UNIQUE (assignment_id, question_id)
);

CREATE TABLE IF NOT EXISTS events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  response_id  TEXT NOT NULL REFERENCES responses(id),
  at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  type         TEXT NOT NULL CHECK (type IN (
    'view', 'helper_open', 'hint_open', 'ai_message_student', 'ai_message_helper',
    'ai_refused_answer', 'paste', 'blur', 'focus', 'snapshot', 'attempt', 'submit')),
  data         TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS events_response ON events(response_id, at);
`;

// Columns added after the first schema. Each entry runs once if the column is missing.
const ADDED_COLUMNS: [table: string, column: string, ddl: string][] = [
  ["users", "archived_at", "ALTER TABLE users ADD COLUMN archived_at TEXT"],
  ["past_items", "section_id", "ALTER TABLE past_items ADD COLUMN section_id TEXT"],
  ["past_items", "secondary", "ALTER TABLE past_items ADD COLUMN secondary TEXT"],
  ["past_items", "topic", "ALTER TABLE past_items ADD COLUMN topic TEXT"],
  ["past_items", "skill", "ALTER TABLE past_items ADD COLUMN skill TEXT"],
  ["past_items", "tag_confidence", "ALTER TABLE past_items ADD COLUMN tag_confidence TEXT"],
  ["past_items", "paper_id", "ALTER TABLE past_items ADD COLUMN paper_id TEXT"],
  ["responses", "first_viewed_at", "ALTER TABLE responses ADD COLUMN first_viewed_at TEXT"],
  ["responses", "auto_correct", "ALTER TABLE responses ADD COLUMN auto_correct INTEGER"],
  ["responses", "answers", "ALTER TABLE responses ADD COLUMN answers TEXT"],
  ["responses", "position", "ALTER TABLE responses ADD COLUMN position INTEGER"],
  ["sets", "preset", "ALTER TABLE sets ADD COLUMN preset TEXT"],
  ["users", "username", "ALTER TABLE users ADD COLUMN username TEXT"],
  ["sets", "review_of", "ALTER TABLE sets ADD COLUMN review_of TEXT"],
  ["users", "password_hash", "ALTER TABLE users ADD COLUMN password_hash TEXT"],
];

function migrate(db: Database.Database) {
  for (const [table, column, ddl] of ADDED_COLUMNS) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === column)) db.exec(ddl);
  }
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_username ON users(username COLLATE NOCASE)");
}

export function openDb(file = DB_PATH): Database.Database {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

export const json = {
  parse<T>(value: string | null | undefined, fallback: T): T {
    if (!value) return fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  },
};
