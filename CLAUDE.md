# Onside (IB Econ) — working rules for Claude Code

Start with `HANDOFF.md`. Look and behaviour come from `reference/onside-demo.html` and `design/`.

## Must hold
- The AI Helper never outputs a final answer, model answer or marking point. Server-side overlap check before every Helper reply.
- Written answers: AI suggests marks with quoted evidence; the tutor confirms; students see marks after confirmation.
- Log paste, tab blur, time per question, and ~20 s text snapshots for long answers. Flag as Unverified when triggered.
- Never commit anything in `content/source/` (IB PDFs, Jin's notes). No past-paper question or mark scheme text in committed files (seeds, migrations, fixtures, tests, content/). Extracted past-paper text lives only in git-ignored `data/` and the local SQLite DB (Jin's decision, 2026-09-17, docs/decisions.md). Committed files hold ids, page pointers and tags only.
- Student-facing copy: plain, sentence case, no emoji, no praise. Tutor-facing results are blunt facts (`18/30 marks | 2 of 5 without AI | Weak spot: Exchange rate diagrams`). AI summaries are 2–3 bullets.
- Sans font for anything read through; serif only for headings and big numbers. Pink once per screen, tutor side only.

## Content format
Follow `docs/question-schema.md`. `content/units/16-exchange-rates-bop.json` is the reference pack; new unit packs match its shape.

## Ask Jin before
Choosing or changing the stack, adding paid services, changing scoring rules, or changing any decision listed in HANDOFF §2.

## Local setup (docs/decisions.md)
- `npm run db:seed` loads content/ into `data/onside.db` (SQLite, git-ignored); `npm run db:reset` starts over.
- `npm run dev`, `npm run typecheck`, `npm run lint`, `npm test`.
- Logins: `npm run account -- --id <id> --password <pw> --tutor` (or `--name <name>` / `--user <student id>` for students). Never put passwords in committed files.
- AI goes through `src/lib/ai`: Claude when `ANTHROPIC_API_KEY` is set, else Gemini. Keys and model-per-task settings in `.env.local`.
- Past papers: PDFs in `content/source/past-papers/` (named `M24_Economics_paper_2__TZ1_HLSL.pdf`). `.venv/bin/python scripts/extract_past_papers.py` writes text and figure crops to `data/past-papers/`, then `npm run db:seed` loads them. Unit/section tags live in `content/past-item-tags.csv` (edit there, then reseed).
- better-sqlite3 is pinned to v12: v13 crashes on this machine's Node 22.8.

@AGENTS.md
