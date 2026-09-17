// Loads content/ into the local SQLite database. Safe to re-run: content rows are upserted,
// users are only added if missing, and student work is never touched.
//   npm run db:seed          upsert content
//   npm run db:reset         delete data/onside.db, then seed
import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { DB_PATH, openDb } from "../src/lib/db-core";

const ROOT = process.cwd();
const CONTENT = path.join(ROOT, "content");

// Decisions in docs/decisions.md.
const PARTS = [
  { id: "micro", name: "Micro", sort: 1 },
  { id: "macro", name: "Macro", sort: 2 },
  { id: "global", name: "Global economy", sort: 3 },
  { id: "development", name: "Economic development", sort: 4 },
];
const PART_ID: Record<string, string> = Object.fromEntries(PARTS.map((p) => [p.name, p.id]));
const UNIT_TITLE_OVERRIDES: Record<number, string> = {
  7: "Market power (HL)",
  // Titles missing from the extracted tree; labels from content/exam-frequency.md.
  17: "Balance of payments and exchange rate systems",
  18: "Sustainable development and measuring development",
  19: "Barriers to growth and development",
  20: "Strategies for growth and development",
};

// Only the tutor is seeded. Jin adds students in the app (Students → Add student).
const USERS = [{ id: "tutor-jin", role: "tutor", name: "Jin", subtitle: "IB Economics HL tutor" }];

type Row = Record<string, string | number | null>;

function upsert(db: Database.Database, table: string, row: Row, key: string[] = ["id"]) {
  const cols = Object.keys(row);
  const updates = cols.filter((c) => !key.includes(c));
  const sql =
    `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map((c) => "@" + c).join(", ")}) ` +
    `ON CONFLICT(${key.join(", ")}) DO ` +
    (updates.length ? `UPDATE SET ${updates.map((c) => `${c} = excluded.${c}`).join(", ")}` : "NOTHING");
  db.prepare(sql).run(row);
}

function readJson<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(CONTENT, rel), "utf8")) as T;
}

// Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, newlines in quotes).
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows.filter((r) => r.some((c) => c !== ""));
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}
const intOrNull = (s: string) => (s === "" || Number.isNaN(Number(s)) ? null : Math.trunc(Number(s)));

type Tree = {
  parts: {
    part: string;
    units: {
      id: string; number: number; title: string | null; concept_extraction?: string;
      sections: { id: string; title: string; hl_only?: boolean; concepts: { term: string; definition_from_notes?: string }[] }[];
    }[];
  }[];
};

type Pack = {
  unit: { id: string; number: number; title: string; sections: { id: string; title: string }[]; exam_weight: string };
  note_corrections: { where: string; issue: string }[];
  concepts: { id: string; section: string; term: string; definition: string }[];
  diagram_checklists: { id: string; name: string }[];
  questions: {
    id: string; format: string; section: string; concepts: string[]; command_term: string; marks: number;
    prompt: string; paper_style?: string; source?: unknown; approved_by_tutor?: boolean;
  }[];
  related_past_items: Record<string, string[]>;
};

function seed(db: Database.Database) {
  for (const u of USERS) upsert(db, "users", u);
  for (const p of PARTS) upsert(db, "parts", p);

  // Syllabus tree
  const tree = readJson<Tree>("syllabus-tree.json");
  const packFiles = fs.readdirSync(path.join(CONTENT, "units")).filter((f) => f.endsWith(".json"));
  const packs = packFiles.map((f) => readJson<Pack>(path.join("units", f)));
  const packedUnits = new Set(packs.map((p) => p.unit.number));

  for (const part of tree.parts) {
    for (const unit of part.units) {
      upsert(db, "units", {
        id: unit.id,
        number: unit.number,
        part_id: PART_ID[part.part],
        title: UNIT_TITLE_OVERRIDES[unit.number] ?? unit.title ?? `Unit ${unit.number}`,
        concept_extraction: unit.concept_extraction ?? null,
        exam_weight: null,
        has_pack: packedUnits.has(unit.number) ? 1 : 0,
      });
      unit.sections.forEach((s, i) => {
        upsert(db, "sections", { id: s.id, unit_id: unit.id, title: s.title, hl_only: s.hl_only ? 1 : 0, sort: i });
        // Units with a pack use the pack's reviewed concepts instead of the auto-extracted ones.
        if (packedUnits.has(unit.number)) return;
        const seen = new Set<string>();
        for (const c of s.concepts) {
          let id = `c${unit.number}-${slug(c.term)}`;
          while (seen.has(id)) id += "-x";
          seen.add(id);
          upsert(db, "concepts", {
            id, unit_id: unit.id, section_id: s.id, term: c.term,
            definition: c.definition_from_notes ?? null, source: "notes",
          });
        }
      });
    }
  }

  // Unit packs
  for (const pack of packs) {
    const unitId = pack.unit.id;
    db.prepare("UPDATE units SET exam_weight = ?, has_pack = 1 WHERE id = ?").run(pack.unit.exam_weight, unitId);
    pack.unit.sections.forEach((s, i) =>
      upsert(db, "sections", { id: s.id, unit_id: unitId, title: s.title, hl_only: 0, sort: i }),
    );
    for (const c of pack.concepts) {
      upsert(db, "concepts", {
        id: c.id, unit_id: unitId, section_id: c.section, term: c.term, definition: c.definition, source: "pack",
      });
    }
    for (const d of pack.diagram_checklists) {
      upsert(db, "diagram_checklists", { id: d.id, unit_id: unitId, name: d.name, data: JSON.stringify(d) });
    }
    db.prepare("DELETE FROM note_corrections WHERE unit_id = ?").run(unitId);
    for (const n of pack.note_corrections) {
      db.prepare("INSERT INTO note_corrections (unit_id, location, issue) VALUES (?, ?, ?)").run(unitId, n.where, n.issue);
    }
    for (const q of pack.questions) {
      upsert(db, "questions", {
        id: q.id, unit_id: unitId, section_id: q.section, format: q.format,
        paper_style: q.paper_style ?? null, command_term: q.command_term, marks: q.marks, prompt: q.prompt,
        data: JSON.stringify(q),
        source: typeof q.source === "string" ? q.source : "original",
        approved_by_tutor: q.approved_by_tutor === false ? 0 : 1,
      });
      db.prepare("DELETE FROM question_concepts WHERE question_id = ?").run(q.id);
      for (const c of q.concepts) {
        db.prepare("INSERT INTO question_concepts (question_id, concept_id) VALUES (?, ?)").run(q.id, c);
      }
    }
    db.prepare("DELETE FROM unit_past_items WHERE unit_id = ?").run(unitId);
    for (const [group, ids] of Object.entries(pack.related_past_items)) {
      for (const id of ids) {
        db.prepare("INSERT OR IGNORE INTO unit_past_items (unit_id, group_name, past_item_id) VALUES (?, ?, ?)")
          .run(unitId, group, id);
      }
    }
  }

  // Past-paper pointers (the CSV has no question text by design).
  const items = parseCsv(fs.readFileSync(path.join(CONTENT, "exam-questions-index.csv"), "utf8"));
  for (const r of items) {
    upsert(db, "past_items", {
      id: r.id, session: r.session, paper: Number(r.paper), level: r.level, tz: r.tz || null,
      question: r.question, marks: intOrNull(r.marks), command_term: r.command_term || null,
      diagram_type: r.diagram_type || null, part: r.part || null, unit_number: intOrNull(r.unit),
      defined_term: r.defined_term || null, qp_file: r.qp_file || null, qp_page: intOrNull(r.qp_page),
      ms_file: r.ms_file || null, ms_page: intOrNull(r.ms_page),
    });
  }

  seedPastPapers(db, items);
  seedUnitTests(db);

  // Hints Jin edited in the app win over the files.
  for (const o of db.prepare("SELECT question_id, hint1, hint2 FROM hint_overrides").all() as { question_id: string; hint1: string; hint2: string }[]) {
    db.prepare("UPDATE questions SET data = json_set(data, '$.hints', json_array(?, ?)) WHERE id = ?").run(o.hint1, o.hint2, o.question_id);
  }

  const count = (t: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
  console.log(
    ["users", "units", "sections", "concepts", "questions", "diagram_checklists", "past_items", "past_papers"]
      .map((t) => `${t}: ${count(t)}`)
      .join(" · "),
  );
}

// ---------- past papers ----------
// Tags (committed, no text): content/past-item-tags.csv.
// Text (local only): data/past-papers/extracted.json from scripts/extract_past_papers.py.

type Extracted = {
  papers: Record<string, { qp_file: string; ms_file: string; ms_general: string[]; questions: Record<string, { context: unknown[] }> }>;
  items: Record<string, {
    paper: string; question: string; label: string; page: number; marks: number | null;
    lead: unknown[]; prompt: string; markscheme: string;
  }>;
};

type Tag = { unit: number; section: string; secondary: string[]; topic: string; diagram: string; skill: string; confidence: string };

const paperId = (r: Record<string, string>) =>
  [r.session, `P${r.paper}`, r.level, r.tz].filter(Boolean).join("-");

function pastFormat(r: Record<string, string>, tag: Tag | undefined, marks: number): string {
  const label = r.question;
  if (r.paper === "1") return label.includes("(b)") ? "essay" : "short_answer";
  if (marks >= 10) return "essay";
  const skill = tag?.skill ?? "";
  const term = (r.command_term || "").toLowerCase();
  if (skill === "definition" || term === "define") return "short_answer";
  if (skill === "calculation" || ["calculate", "determine"].includes(term)) return "calculation";
  if (skill === "diagram explanation" || tag?.diagram || r.diagram_type) return "diagram";
  return "short_answer";
}

function paperStyle(r: Record<string, string>): string {
  if (r.paper === "1") return r.question.includes("(b)") ? "P1(b)" : "P1(a)";
  return r.paper === "2" ? "P2" : "P3";
}

function seedPastPapers(db: Database.Database, rows: Record<string, string>[]) {
  const tagsPath = path.join(CONTENT, "past-item-tags.csv");
  const tags = new Map<string, Tag>();
  if (fs.existsSync(tagsPath)) {
    for (const t of parseCsv(fs.readFileSync(tagsPath, "utf8"))) {
      tags.set(t.id, {
        unit: Number(t.unit), section: t.section, secondary: t.secondary ? t.secondary.split(" ") : [],
        topic: t.topic, diagram: t.diagram, skill: t.skill, confidence: t.confidence,
      });
    }
  }
  const sectionExists = db.prepare("SELECT 1 FROM sections WHERE id = ?");
  for (const r of rows) {
    const t = tags.get(r.id);
    db.prepare(
      `UPDATE past_items SET paper_id = ?, unit_number = COALESCE(?, unit_number), section_id = ?, secondary = ?,
              topic = ?, skill = ?, tag_confidence = ?, diagram_type = COALESCE(NULLIF(?, ''), diagram_type) WHERE id = ?`,
    ).run(paperId(r), t?.unit ?? null, t?.section ?? null, t ? t.secondary.join(" ") : null,
      t?.topic ?? null, t?.skill ?? null, t?.confidence ?? null, t?.diagram ?? "", r.id);
  }

  const extractedPath = path.join(ROOT, "data", "past-papers", "extracted.json");
  if (!fs.existsSync(extractedPath)) {
    console.log("No data/past-papers/extracted.json — run scripts/extract_past_papers.py to load past-paper text.");
    return;
  }
  const ex = JSON.parse(fs.readFileSync(extractedPath, "utf8")) as Extracted;
  // Draft hints written for every past item (content/past-item-hints.json, no paper text).
  const hintsPath = path.join(CONTENT, "past-item-hints.json");
  const hints: Record<string, [string, string]> = fs.existsSync(hintsPath)
    ? JSON.parse(fs.readFileSync(hintsPath, "utf8"))
    : {};
  const first = new Map<string, Record<string, string>>();
  for (const r of rows) if (!first.has(paperId(r))) first.set(paperId(r), r);

  for (const [pid, p] of Object.entries(ex.papers)) {
    const r = first.get(pid);
    if (!r) continue;
    upsert(db, "past_papers", {
      id: pid, session: r.session, paper: Number(r.paper), level: r.level, tz: r.tz || null,
      qp_file: p.qp_file, ms_file: p.ms_file, ms_general: JSON.stringify(p.ms_general),
    });
    for (const [num, q] of Object.entries(p.questions)) {
      upsert(db, "past_questions", { paper_id: pid, number: num, context: JSON.stringify(q.context) }, ["paper_id", "number"]);
    }
  }

  const unitId = new Map(
    (db.prepare("SELECT id, number FROM units").all() as { id: string; number: number }[]).map((u) => [u.number, u.id]),
  );
  let loaded = 0;
  for (const r of rows) {
    const it = ex.items[r.id];
    if (!it) continue;
    const t = tags.get(r.id);
    const marks = it.marks ?? intOrNull(r.marks) ?? 0;
    const unitNumber = t?.unit ?? intOrNull(r.unit);
    const uid = unitNumber ? unitId.get(unitNumber) : undefined;
    if (!uid) continue;
    const section = t?.section && sectionExists.get(t.section) ? t.section : null;
    const format = pastFormat(r, t, marks);
    const pid = paperId(r);
    const label = `${r.session} P${r.paper}${r.tz ? ` ${r.tz}` : ""} ${r.level} · Q${r.question}`;
    const data = {
      id: `pp-${r.id}`,
      format,
      paper_style: paperStyle(r),
      section: section ?? "",
      concepts: [],
      command_term: r.command_term || "",
      marks,
      prompt: it.prompt,
      hints: hints[r.id] ?? null,
      targets: t?.topic ?? "",
      source: { past_item: r.id },
      past: {
        item: r.id, paper: pid, question: it.question, label, lead: it.lead,
        secondary: t?.secondary ?? [], diagram: t?.diagram || r.diagram_type || "",
      },
      marking: { type: "past_markscheme", text: it.markscheme },
    };
    upsert(db, "questions", {
      id: `pp-${r.id}`, unit_id: uid, section_id: section, format, paper_style: data.paper_style,
      command_term: r.command_term || null, marks, prompt: it.prompt, data: JSON.stringify(data),
      source: "past", approved_by_tutor: 1,
    });
    loaded++;
  }
  console.log(`Past-paper questions loaded: ${loaded} (tags for ${tags.size}, hints for ${Object.keys(hints).length})`);
}

// ---------- unit tests ----------
// content/unit-tests/unit-NN.json: 30 original questions per unit, loaded as questions and as a preset set.

type UnitTest = { unit: number; title: string; questions: ({ id: string; format: string; section: string; concepts?: string[]; command_term: string; marks: number; prompt: string })[] };

function seedUnitTests(db: Database.Database) {
  const dir = path.join(CONTENT, "unit-tests");
  if (!fs.existsSync(dir)) return;
  const unitId = db.prepare("SELECT id, title FROM units WHERE number = ?");
  const conceptExists = db.prepare("SELECT 1 FROM concepts WHERE id = ?");
  const sectionExists = db.prepare("SELECT 1 FROM sections WHERE id = ?");
  let n = 0;
  for (const file of fs.readdirSync(dir).filter((f) => /^unit-\d+\.json$/.test(f)).sort()) {
    const pack = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as UnitTest;
    const u = unitId.get(pack.unit) as { id: string; title: string } | undefined;
    if (!u) continue;
    for (const q of pack.questions) {
      upsert(db, "questions", {
        id: q.id, unit_id: u.id, section_id: sectionExists.get(q.section) ? q.section : null, format: q.format,
        paper_style: null, command_term: q.command_term, marks: q.marks, prompt: q.prompt,
        data: JSON.stringify({ ...q, concepts: (q.concepts ?? []).filter((c) => conceptExists.get(c)) }),
        source: "unit-test", approved_by_tutor: 1,
      });
      db.prepare("DELETE FROM question_concepts WHERE question_id = ?").run(q.id);
      for (const c of q.concepts ?? []) {
        if (conceptExists.get(c)) db.prepare("INSERT OR IGNORE INTO question_concepts (question_id, concept_id) VALUES (?, ?)").run(q.id, c);
      }
      n++;
    }
    // Preset set: helper off, like a test. Filled once; Jin's later edits are kept.
    const setId = `preset-unit-${String(pack.unit).padStart(2, "0")}`;
    const filled = db.prepare("SELECT 1 FROM set_items WHERE set_id = ?").get(setId);
    db.prepare(
      `INSERT INTO sets (id, title, mode, helper, created_by, preset) VALUES (?, ?, 'assigned', 'off', 'tutor-jin', 'unit-test')
       ON CONFLICT(id) DO UPDATE SET preset = 'unit-test'`,
    ).run(setId, `Unit ${pack.unit} test: ${u.title}`.slice(0, 100));
    if (!filled) {
      pack.questions.forEach((q, i) => db.prepare("INSERT INTO set_items (set_id, position, question_id) VALUES (?, ?, ?)").run(setId, i + 1, q.id));
    }
  }
  console.log(`Unit test questions loaded: ${n}`);
}

if (process.argv.includes("--reset")) {
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(DB_PATH + suffix, { force: true });
  console.log(`Deleted ${path.relative(ROOT, DB_PATH)}`);
}
const db = openDb();
db.transaction(() => seed(db))();
db.close();
console.log(`Seeded ${path.relative(ROOT, DB_PATH)}`);
