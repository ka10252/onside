"""Checks content/unit-tests/unit-NN.json against the rules in data/unit-tests/INSTRUCTIONS.md.

Run: .venv/bin/python scripts/check_unit_tests.py
"""

import collections
import json
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
db = sqlite3.connect(ROOT / "data" / "onside.db")
problems = 0


def bad(unit, qid, msg):
    global problems
    problems += 1
    print(f"unit {unit} {qid}: {msg}")


for f in sorted((ROOT / "content" / "unit-tests").glob("unit-*.json")):
    pack = json.loads(f.read_text())
    unit = pack["unit"]
    uid = db.execute("select id from units where number = ?", (unit,)).fetchone()[0]
    sections = {r[0] for r in db.execute("select id from sections where unit_id = ?", (uid,))}
    concepts = {r[0] for r in db.execute("select id from concepts where unit_id = ?", (uid,))}
    qs = pack["questions"]
    ids = [q["id"] for q in qs]
    fmts = collections.Counter(q["format"] for q in qs)
    answers = collections.Counter(q.get("answer") for q in qs if q["format"] == "mcq")
    tables = sum(1 for q in qs if q.get("table"))
    if len(qs) != 30 or fmts["mcq"] != 15 or fmts["short_answer"] != 15:
        bad(unit, "-", f"counts {len(qs)} {dict(fmts)}")
    if len(set(ids)) != len(ids):
        bad(unit, "-", "duplicate ids")
    for q in qs:
        qid = q["id"]
        if q.get("section") not in sections:
            bad(unit, qid, f"unknown section {q.get('section')}")
        for c in q.get("concepts", []):
            if c not in concepts:
                bad(unit, qid, f"unknown concept {c}")
        h = q.get("hints")
        if not (isinstance(h, list) and len(h) == 2 and all(isinstance(x, str) and x.strip() for x in h)):
            bad(unit, qid, "hints")
        if not q.get("prompt") or not q.get("command_term"):
            bad(unit, qid, "prompt/command_term")
        t = q.get("table")
        if t and not (isinstance(t.get("columns"), list) and all(isinstance(r, list) and len(r) == len(t["columns"]) for r in t.get("rows", []))):
            bad(unit, qid, "table shape")
        if q["format"] == "mcq":
            opts = q.get("options", [])
            if q.get("marks") != 1 or [o.get("id") for o in opts] != ["a", "b", "c", "d"]:
                bad(unit, qid, "mcq marks/options")
            if q.get("answer") not in {"a", "b", "c", "d"}:
                bad(unit, qid, "mcq answer")
            for o in opts:
                if (o["id"] == q.get("answer")) != (o.get("misconception") is None):
                    bad(unit, qid, f"misconception on option {o['id']}")
        else:
            mp = q.get("marking_points", [])
            total = sum(int(m) for p in mp for m in re.findall(r"\[(\d+)\]\s*$", p))
            if not (2 <= q.get("marks", 0) <= 4) or total != q.get("marks"):
                bad(unit, qid, f"marks {q.get('marks')} vs marking points {total}")
    print(f"unit {unit:2}: {len(qs)} q · answers {dict(sorted(answers.items()))} · tables {tables}")

print(f"{problems} problems")
sys.exit(1 if problems else 0)
