"""Extract IB past-paper items from content/source/past-papers into data/past-papers/.

Output (git-ignored, never commit):
  data/past-papers/extracted.json   per item: prompt, lead-in, question context, mark scheme text
  data/past-papers/img/<paper>/     figures and tables cropped from the question papers

Item ids and file pointers come from content/exam-questions-index.csv.

Run:  .venv/bin/python scripts/extract_past_papers.py [paper-id-prefix ...]
Needs pymupdf in .venv (python3 -m venv .venv && .venv/bin/pip install pymupdf).

IB papers share one layout: question numbers at x≈42, part letters at x≈71,
roman subparts at x≈99, marks "[n]" at the right edge. Mark schemes repeat the same labels.
"""

from __future__ import annotations

import csv
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "content" / "source"
OUT = ROOT / "data" / "past-papers"
INDEX = ROOT / "content" / "exam-questions-index.csv"

Q_RE = re.compile(r"^(\d{1,2})\.$")
PART_RE = re.compile(r"^\(([a-h])\)$")
ROMAN_RE = re.compile(r"^\((i|ii|iii|iv|v|vi|vii|viii|ix|x)\)$")
MARKS_RE = re.compile(r"^\[(\d{1,2})\]$")
GLUED_MARKS_RE = re.compile(r"^(.*\S)\s*\[(\d{1,2})\]$")
CAPTION_RE = re.compile(r"^(Figure|Table|Diagram)\s+\d+\s*(:|$)")
LEADING_LABEL_RE = re.compile(r"^(\d{1,2}\.|\([a-h]\)|\((?:i|ii|iii|iv|v|vi|vii|viii|ix|x)\))\s+(\S.*)$")
CONTROL_RE = re.compile(r"[\x00-\x08\x0b-\x1f]")
TEXT_HEAD_RE = re.compile(r"^Text\s+[A-Z]\s+[—–-]")
SKIP_RE = re.compile(
    r"^(Turn over|\(Question \d+ continued\)|\(This question continues.*\)|Answer one question\.?"
    r"|Answer all the questions\..*|Please do not write on this page\.?|Answers written on this page"
    r"|will not be marked\.?|Blank page|\d{2}EP\d{2}|\*?[A-Z]?\d{4}\s*[–-]\s*\d{4}\s*M?\*?"
    r"|[–-] ?\d+ ?[–-]|[MN]\d\d/\d/ECONO/.*)$"
)
DOTS_RE = re.compile(r"^[\s.…�]+$")


class L:
    """One text line with position."""

    __slots__ = ("page", "x", "y0", "x1", "y1", "text", "md")

    def __init__(self, page, x, y0, x1, y1, text, md):
        self.page, self.x, self.y0, self.x1, self.y1, self.text, self.md = page, x, y0, x1, y1, text, md


def spans_md(spans) -> str:
    out = []
    for s in spans:
        t = s["text"]
        core = t.strip()
        if core and s["flags"] & 16:
            lead = t[: len(t) - len(t.lstrip())]
            trail = t[len(t.rstrip()):]
            out.append(f"{lead}**{core}**{trail}")
        else:
            out.append(t)
    md = "".join(out)
    return re.sub(r"\*\*(\s*)\*\*", r"\1", md).strip()


def page_lines(page: pymupdf.Page) -> list[L]:
    h = page.rect.height
    lines = []
    for b in page.get_text("dict")["blocks"]:
        for ln in b.get("lines", []):
            spans = [dict(s, text=CONTROL_RE.sub("", s["text"]).replace("\t", " ")) for s in ln["spans"]]
            for sp in spans:  # Wingdings "y" is a bullet
                if sp["font"].startswith("Wingdings") and sp["text"].strip() == "y":
                    sp["text"] = sp["text"].replace("y", "•")
            spans = [s for s in spans if s["text"]]
            text = "".join(s["text"] for s in spans).strip()
            if not text or DOTS_RE.match(text):
                continue
            x0, y0, x1, y1 = ln["bbox"]
            if y0 < 58 or y0 > h - 58 or SKIP_RE.match(text):
                continue
            md = spans_md(spans)
            # "(vii) Define the term ..." on one line: split the label off
            while x0 < 140 and (m := LEADING_LABEL_RE.match(text)):
                label = m.group(1)
                lx = x0
                lines.append(L(page.number, lx, y0, lx + 20, y1, label, label))
                text = m.group(2)
                md = re.sub(r"^\**" + re.escape(label) + r"\**\s*", "", md)
                x0 = lx + 1
            lines.append(L(page.number, x0, y0, x1, y1, text, md))
    # rows: lines whose tops are within 2.5pt belong together, then left to right
    lines.sort(key=lambda l: l.y0)
    rows, row_y = [], None
    for l in lines:
        if row_y is None or l.y0 - row_y > 2.5:
            rows.append([])
            row_y = l.y0
        rows[-1].append(l)
    return [l for row in rows for l in sorted(row, key=lambda l: l.x)]


def content_pages(doc) -> list[int]:
    keep = []
    for p in range(doc.page_count):
        t = doc[p].get_text()
        head = t[:400]
        if "All rights reserved" in head and p == 0:
            continue
        if "Instructions to candidates" in t:
            continue
        if re.search(r"^\s*(Disclaimer|References:|Acknowledgements?)", t) or "References:" in head:
            continue
        if t.count("[Accessed") + t.count("Source adapted") >= 2:  # source list pages
            continue
        keep.append(p)
    return keep


def answer_line_tops(page: pymupdf.Page) -> list[float]:
    tops = []
    for b in page.get_text("dict")["blocks"]:
        for ln in b.get("lines", []):
            t = "".join(s["text"] for s in ln["spans"]).strip()
            if t and DOTS_RE.match(t) and len(t) > 20:
                tops.append(ln["bbox"][1])
    return tops


def figure_regions(page: pymupdf.Page, lines: list[L]):
    """Caption line -> clip rect covering the caption and the drawing/table under it."""
    h = page.rect.height
    drawings = [
        d["rect"] for d in page.get_drawings()
        if d["rect"].height < h * 0.8 and d["rect"].y1 < h - 70  # skip page furniture and barcodes
    ]
    answer_tops = answer_line_tops(page)
    regions = []
    for cap in [l for l in lines if CAPTION_RE.match(l.text)]:
        stops = [
            l.y0
            for l in lines
            if l.y0 > cap.y1 + 2
            and (
                (Q_RE.match(l.text) and l.x < 80)
                or (PART_RE.match(l.text) and l.x < 110)
                or (ROMAN_RE.match(l.text) and l.x < 140)
                or TEXT_HEAD_RE.match(l.text)
                or CAPTION_RE.match(l.text)
            )
        ]
        stops += [y for y in answer_tops if y > cap.y1 + 2]
        stop = min(stops) if stops else page.rect.height - 58
        bottom = cap.y1
        for l in lines:  # captions that wrap onto a second line
            if 0 <= l.y0 - bottom <= 4 and l.y0 < stop:
                bottom = l.y1
        grew = True
        while grew:
            grew = False
            for r in drawings:
                if r.y1 > bottom and r.y0 <= bottom + 36 and r.y1 <= stop + 2:
                    bottom, grew = r.y1, True
        drawn = bottom
        for l in lines:  # axis labels and notes that sit just under the drawing (no chaining)
            if cap.y1 < l.y0 < stop and l.y0 <= drawn + 16:
                bottom = max(bottom, l.y1)
        regions.append((pymupdf.Rect(36, cap.y0 - 4, page.rect.width - 36, min(bottom + 6, stop - 1)), cap))
    return regions


def save_clip(page: pymupdf.Page, rect: pymupdf.Rect, path: Path):
    """Render a region and trim white margins."""
    pix = page.get_pixmap(clip=rect, dpi=170)
    w, h, n = pix.width, pix.height, pix.n
    data = pix.samples
    def dark(x, y):
        i = (y * w + x) * n
        return min(data[i], data[i + 1], data[i + 2]) < 235
    rows = [y for y in range(0, h, 2) if any(dark(x, y) for x in range(0, w, 3))]
    cols = [x for x in range(0, w, 2) if any(dark(x, y) for y in range(0, h, 3))]
    if rows and cols:
        k = 170 / 72
        pad = 8
        clip = pymupdf.Rect(
            rect.x0 + max(cols[0] - pad, 0) / k, rect.y0 + max(rows[0] - pad, 0) / k,
            rect.x0 + min(cols[-1] + pad, w) / k, rect.y0 + min(rows[-1] + pad, h) / k,
        )
        pix = page.get_pixmap(clip=clip, dpi=170)
    pix.save(path)


def events(doc, *, figures: bool):
    """Reading-order events: (kind, value, line) with kind in q/part/roman/marks/text/figure."""
    for pno in content_pages(doc):
        page = doc[pno]
        lines = page_lines(page)
        regions = figure_regions(page, lines) if figures else []
        pending = list(regions)
        for l in lines:
            while pending and l.y0 >= pending[0][0].y0 - 1:
                yield ("figure", pending.pop(0), None)
            if any(r.y0 - 1 <= l.y0 <= r.y1 for r, _ in regions):
                continue
            t = l.text
            if Q_RE.match(t) and l.x < 80:
                yield ("q", Q_RE.match(t).group(1), l)
            elif PART_RE.match(t) and l.x < 110:
                yield ("part", PART_RE.match(t).group(1), l)
            elif ROMAN_RE.match(t) and l.x < 140:
                yield ("roman", ROMAN_RE.match(t).group(1), l)
            elif MARKS_RE.match(t) and l.x > 380:
                yield ("marks", int(MARKS_RE.match(t).group(1)), l)
            elif GLUED_MARKS_RE.match(t) and l.x1 > 440:
                m = GLUED_MARKS_RE.match(t)
                md = re.sub(r"\s*\**\[\d{1,2}\]\**$", "", l.md)
                yield ("text", None, L(l.page, l.x, l.y0, l.x1, l.y1, m.group(1), md))
                yield ("marks", int(m.group(2)), l)
            else:
                yield ("text", None, l)
        for reg in pending:
            yield ("figure", reg, None)


def paragraphs(lines: list[L]) -> list[str]:
    """Join wrapped lines. Paragraph numbers in the left margin become "[n]"."""
    paras: list[str] = []
    prev = None
    number_pending = False
    for l in lines:
        is_num = bool(re.fullmatch(r"\d{1,2}", l.text)) and l.x < 80
        if is_num:
            paras.append(f"[{l.text}]")
            number_pending = True
        elif number_pending:
            paras[-1] += " " + l.md
            number_pending = False
        elif prev is None or prev.page != l.page or l.y0 - prev.y1 > 5.5:
            paras.append(l.md)
        elif abs(l.y0 - prev.y0) < 3:  # same row, separate cell
            paras[-1] += "  " + l.md
        else:
            paras[-1] += " " + l.md
        prev = l
    return [re.sub(r"[ \t]+", " ", p).strip() for p in paras if p.strip()]


def label_of(q, part, roman):
    return f"{q}" + (f"({part})" if part else "") + (f"({roman})" if roman else "")


# ------------------------------------------------------------------ question paper


def extract_qp(doc, paper_id: str, img_dir: Path):
    questions: dict[str, dict] = {}
    items: dict[str, dict] = {}
    q = part = None
    mode = "none"  # qstem | partstem | prompt | between
    buf: list[L] = []
    lead: list[dict] = []  # blocks that apply to the following items of this part
    carry: list[dict] = []  # text/figures after marks, waiting for the next label
    part_page = 0
    fig_n = 0

    def blocks(ls):
        return [{"type": "text", "text": p} for p in paragraphs(ls)]

    def settle_between(next_kind):
        nonlocal carry, buf
        pending = carry + blocks(buf)
        carry, buf = [], []
        if next_kind in ("roman", "part"):
            return pending
        return []  # before a new question: drop trailing text

    def add_item(label, page, prompt_lines, current_lead):
        items[label] = {
            "label": label,
            "page": page + 1,
            "lead": list(current_lead),
            "prompt": "\n\n".join(paragraphs(prompt_lines)),
            "marks": None,
        }
        return items[label]

    cur = None
    for kind, val, line in events(doc, figures=True):
        if kind == "figure":
            rect, cap = val
            fig_n += 1
            img_dir.mkdir(parents=True, exist_ok=True)
            name = f"fig{fig_n}.png"
            save_clip(doc[cap.page], rect, img_dir / name)
            block = {"type": "image", "src": f"{paper_id}/{name}", "caption": cap.text}
            if mode == "qstem":
                questions[q]["context"] += blocks(buf) + [block]
                buf = []
            elif mode in ("between", "partstem"):
                carry += blocks(buf) + [block]
                buf = []
            elif mode == "prompt":
                carry.append(block)
            continue

        if kind == "q":
            if mode == "qstem" and q is not None:
                questions[q]["context"] += blocks(buf)
            q, part, cur = val, None, None
            questions[q] = {"page": line.page + 1, "context": []}
            mode, buf, lead, carry = "qstem", [], [], []
            continue
        if q is None:
            continue

        if kind == "part":
            if mode == "qstem":
                questions[q]["context"] += blocks(buf)
                buf, pre = [], []
            elif mode == "between":
                pre = settle_between("part")
            else:
                pre = carry + blocks(buf)
                buf, carry = [], []
            part, lead = val, pre
            mode, part_page = "partstem", line.page
            continue

        if kind == "roman":
            if mode == "qstem":
                questions[q]["context"] += blocks(buf)
                buf, part, lead = [], None, []
            elif mode == "partstem":
                lead = lead + carry + blocks(buf)
                buf, carry = [], []
            elif mode == "between":
                lead = lead + settle_between("roman")
            mode = "prompt"
            cur = add_item(label_of(q, part, val), line.page, [], lead)
            continue

        if kind == "marks":
            if mode == "partstem":
                cur = add_item(label_of(q, part, None), part_page, buf, lead + carry)
                carry = []
            elif mode == "prompt":
                cur["prompt"] = "\n\n".join(paragraphs(buf))
                if carry:  # a figure sat inside the prompt
                    cur["lead"] = cur["lead"] + carry
                    carry = []
            elif mode == "qstem":
                cur = add_item(label_of(q, None, None), line.page, buf, [])
            elif mode == "between" and cur is not None and buf:
                cur["prompt"] += "\n\n" + "\n\n".join(paragraphs(buf))
            if cur is not None:
                cur["marks"] = val
            buf, mode = [], "between"
            continue

        if kind == "text":
            buf.append(line)

    # a label with no text and no marks is a stray match (e.g. inside an answer box)
    items = {k: v for k, v in items.items() if v["prompt"] or v["marks"] is not None}
    return questions, items


# ------------------------------------------------------------------ mark scheme


def extract_ms(doc):
    """Split a mark scheme into label segments.

    Returns (general paragraphs, [{label, prompt, body}]). The mark scheme repeats the question
    before its marks; that repeat is `prompt`, the rest is `body`.
    """
    general: list[L] = []
    segs: list[dict] = []
    q = part = roman = None
    seg = None
    for kind, val, line in events(doc, figures=False):
        if kind in ("q", "part", "roman"):
            if kind == "q":
                q, part, roman = val, None, None
            elif q is None:
                continue
            elif kind == "part":
                part, roman = val, None
            else:
                roman = val
            seg = {"label": label_of(q, part, roman), "pre": [], "post": [], "marks": None}
            segs.append(seg)
            continue
        if seg is None:
            if kind == "text":
                general.append(line)
            continue
        if kind == "marks" and seg["marks"] is None:
            seg["marks"] = val
            continue
        if kind == "text":
            (seg["post"] if seg["marks"] is not None else seg["pre"]).append(line)
    out = []
    for sg in segs:
        pre, post = paragraphs(sg["pre"]), paragraphs(sg["post"])
        joined = "\n".join(pre)
        inline = re.search(r"\*{0,2}\[(\d{1,2})\]\*{0,2}", joined)
        if sg["marks"] is None and inline:
            # marks printed inside a line: split there
            sg["marks"] = int(inline.group(1))
            prompt = [joined[: inline.start()].strip()]
            body = [joined[inline.end():].strip()] + post
            out.append({"label": sg["label"], "prompt": " ".join(prompt), "body": "\n".join(b for b in body if b), "marks": sg["marks"]})
            continue
        if sg["marks"] is None and pre:
            # no marks line: the first paragraph is the repeated question
            prompt, body = pre[:1], pre[1:]
        else:
            prompt, body = pre, post
        out.append({"label": sg["label"], "prompt": " ".join(prompt), "body": "\n".join(body), "marks": sg["marks"]})
    return paragraphs(general), out


def norm(t: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", t.replace("**", "").lower()).strip()


def similarity(a: str, b: str) -> float:
    wa, wb = set(norm(a).split()), set(norm(b).split())
    if not wa or not wb:
        return 0.0
    return len(wa & wb) / len(wa | wb)


def trim_body(body: str, prompt: str) -> str:
    """Drop the tail of the repeated question that landed after the marks line."""
    lines = body.split("\n")
    target = norm(prompt)
    while lines and len(norm(lines[0])) >= 20 and norm(lines[0]) in target:
        lines.pop(0)
    return re.sub(r"^[\s.,;:]+", "", "\n".join(lines))


def match_markscheme(items: dict[str, dict], segs: list[dict]) -> dict[str, str]:
    """QP label -> mark scheme body. Label first; fall back to the most similar repeated prompt."""
    by_label = {}
    for sg in segs:
        if sg["prompt"] or sg["body"]:
            by_label.setdefault(sg["label"], sg)
    result = {}
    for label, it in items.items():
        sg = by_label.get(label)
        if sg and (not sg["prompt"] or similarity(sg["prompt"], it["prompt"]) >= 0.45):
            result[label] = trim_body(sg["body"], it["prompt"])
            it["ms_match"] = round(similarity(sg["prompt"], it["prompt"]), 2) if sg["prompt"] else None
            continue
        best = max(segs, key=lambda s: similarity(s["prompt"], it["prompt"]), default=None)
        if best and similarity(best["prompt"], it["prompt"]) >= 0.6:
            result[label] = trim_body(best["body"], it["prompt"])
            it["ms_match"] = f"by prompt from {best['label']}"
    return result


# ------------------------------------------------------------------ main


def paper_key(row):
    return "-".join(x for x in (row["session"], f"P{row['paper']}", row["level"], row["tz"]) if x)


def main(prefixes: list[str]):
    rows = list(csv.DictReader(open(INDEX, encoding="utf-8-sig")))
    by_paper: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_paper[paper_key(r)].append(r)

    OUT.mkdir(parents=True, exist_ok=True)
    out_path = OUT / "extracted.json"
    result = json.loads(out_path.read_text()) if out_path.exists() and prefixes else {"papers": {}, "items": {}}
    report = []

    for pid, prow in sorted(by_paper.items()):
        if prefixes and not any(pid.startswith(p) for p in prefixes):
            continue
        qp_file, ms_file = prow[0]["qp_file"], prow[0]["ms_file"]
        img_dir = OUT / "img" / pid
        for old in img_dir.glob("*.png"):
            old.unlink()
        qdoc = pymupdf.open(SRC / qp_file)
        questions, items = extract_qp(qdoc, pid, img_dir)
        general, ms = ([], {})
        if ms_file and (SRC / ms_file).exists():
            general, segs = extract_ms(pymupdf.open(SRC / ms_file))
            ms = match_markscheme(items, segs)
        result["papers"][pid] = {
            "qp_file": qp_file,
            "ms_file": ms_file,
            "questions": questions,
            "ms_general": general,
        }
        missing, marks_off, no_ms = [], [], []
        for r in prow:
            label = r["question"]
            it = items.get(label)
            if not it:
                missing.append(label)
                continue
            if r["marks"] and it["marks"] is not None and int(r["marks"]) != it["marks"]:
                marks_off.append(f"{label} index={r['marks']} pdf={it['marks']}")
            if not ms.get(label):
                no_ms.append(label)
            result["items"][r["id"]] = {
                "paper": pid,
                "question": label.split("(")[0],
                **it,
                "markscheme": ms.get(label, ""),
            }
        extra = sorted(set(items) - {r["question"] for r in prow})
        report.append((pid, len(prow), missing, extra, marks_off, no_ms))

    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=1))
    bad = 0
    for pid, n, missing, extra, marks_off, no_ms in report:
        flag = missing or extra or marks_off or no_ms
        bad += bool(flag)
        if flag:
            print(f"{pid}: {n} items | missing {missing} | extra {extra} | marks {marks_off} | no ms {no_ms}")
    print(f"{len(report)} papers, {bad} with issues, {len(result['items'])} items written to {out_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main(sys.argv[1:])
