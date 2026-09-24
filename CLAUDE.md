# Onside (IB Econ) — working rules for Claude Code

Start with `HANDOFF.md`. Look and behaviour come from `reference/onside-demo.html` and `design/`.

## Must hold
- The AI Helper never outputs a final answer, model answer or marking point. Server-side overlap check before every Helper reply.
- Written answers: AI suggests marks with quoted evidence; the tutor confirms; students see marks after confirmation.
- Log paste, tab blur, time per question, and ~20 s text snapshots for long answers. Flag as Unverified when triggered.
- Never commit anything in `content/source/` (IB PDFs, Jin's notes). No past-paper question or mark scheme text in committed files (seeds, migrations, fixtures, tests, content/). Extracted past-paper text lives only in git-ignored `data/` and the private database (local, or Supabase since 2026-09-18; docs/decisions.md). Committed files hold ids, page pointers and tags only.
- Student-facing copy: plain, sentence case, no emoji, no praise. Tutor-facing results are blunt facts (`18/30 marks | 2 of 5 without AI | Weak spot: Exchange rate diagrams`). AI summaries are 2–3 bullets.
- Sans font for anything read through; serif only for headings and big numbers. Pink once per screen, tutor side only.

## Content format
Follow `docs/question-schema.md`. `content/units/16-exchange-rates-bop.json` is the reference pack; new unit packs match its shape.

## Ask Jin before
Choosing or changing the stack, adding paid services, changing scoring rules, or changing any decision listed in HANDOFF §2.

## Setup (docs/decisions.md)
- Hosting: Vercel (region bom1, matching the Supabase project's region) + Supabase (Postgres and a private Storage bucket `onside`). Keys in `.env.local` locally and in Vercel env vars. See docs/deploy.md.
- Database access goes through `src/lib/db.ts` (`all`, `one`, `run`, `tx`; `?` placeholders, Postgres SQL). With `DATABASE_URL` set it uses Supabase; without it (or with `ONSIDE_DB=local`) an embedded PGlite database in `data/pglite`. Schema: `SCHEMA` in `src/lib/db-core.ts` (`CREATE … IF NOT EXISTS`); `npm run db:seed` applies it.
- Daily practice: `src/lib/schedule.ts` + `/api/cron/daily`, once a day from `vercel.json` (about 7am Singapore), guarded by `CRON_SECRET`.
- Files (diagram photos, past-paper figures) go through `src/lib/storage.ts`: Supabase Storage, else `data/storage`.
- Vercel has no always-on server: background work uses `after()` from `next/server` (AI marking), and batch results are collected when the tutor opens pages. No in-memory state that must survive between requests.
- `npm run db:seed` loads content/ and past-paper text/figures into the database (Supabase when configured). `npm run db:reset` only resets the local PGlite database. `npm run db:import-sqlite` copied the old `data/onside.db` once.
- The local database (PGlite) is opened by one process at a time and now holds `data/pglite/in-use.pid` while open; a second process is turned away with a message. Stop `npm run dev:local` before `db:pull`, `db:migrate` or `db:seed` on it, then start it again. If it ever refuses to open (`RuntimeError: Aborted()`), rebuild it: `ONSIDE_DB=local npm run db:reset` then `npm run db:pull`.
- Looking at screens: `npm run dev:local` (the copy in data/pglite; every query is local, so pages render in milliseconds). `npm run db:pull` refreshes that copy from Supabase. `npm run dev` talks to Supabase itself — each query crosses to the database's region (about 68 ms from Singapore), so pages take seconds; use it only to check the live data.
- `npm run typecheck`, `npm run lint`, `npm test` (always local).
- Tests and browser checks: use `npm run dev:local`, never the Supabase data, and never real Claude calls.
- Logins: `npm run account -- --id <id> --password <pw> --tutor` (or `--name <name>` / `--user <student id>` for students). Never put passwords in committed files.
- AI goes through `src/lib/ai`: Claude when `ANTHROPIC_API_KEY` is set, else Gemini. Keys and model-per-task settings in `.env.local`.
- Past papers: PDFs in `content/source/past-papers/` (named `M24_Economics_paper_2__TZ1_HLSL.pdf`). `.venv/bin/python scripts/extract_past_papers.py` writes text and figure crops to `data/past-papers/`, then `npm run db:seed` loads them. Unit/section tags live in `content/past-item-tags.csv` (edit there, then reseed).
- better-sqlite3 (v12, dev only) is used just by the one-off SQLite import; v13 crashes on this machine's Node 22.8.

@AGENTS.md
