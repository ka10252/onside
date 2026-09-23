# Decisions after handoff v2 (2026-09-17)

These override HANDOFF §6 and answer §8 where they differ.

## Stack
- Local only for now. No Vercel deploy yet.
- Next.js (App Router, TypeScript).
- SQLite for the database (single file, git-ignored). Move to Supabase later if Onside goes online.
- Login: simple account picker on the start page (Jin as tutor, students by name). No passwords while local.
- Diagram photos stored on local disk (git-ignored).

## AI
- Google Gemini API, free tier. No paid AI service.
  - Gemini 3 Flash: Helper, marking suggestions, diagram check, tutor summary, question generation.
  - Gemini 3.1 Flash-Lite: leak check.
- Free-tier inputs may be used by Google to improve its models. Don't send student names or personal details; use a student id.
- Put AI calls behind a provider interface so the provider can be swapped (e.g. back to Anthropic) without touching feature code.
- Server-side only. Key in `.env.local` as `GEMINI_API_KEY`.

## Content
- Past-paper PDFs are not shown as PDFs in the app.
- Superseded below ("Past-paper questions as set questions").
- Unit 1 (Introduction to economics) stays under Micro.
- Unit 7 is shown as "Market power (HL)" (the notes/index call it "Market failure … III (HL)").
- Next unit pack after 16: unit 7.

## Scope
- No parent view for now.

## Admin (2026-09-17)
- No seeded students. Jin adds, edits and archives students under Students. Archived students disappear from the sign-in page; their work is kept.
- Sets: built from the bank under Sets, sent to one or more students with an optional due date. A set can be edited, deleted or unsent only while nobody has started it.

## Past-paper files (2026-09-17)
- PDFs copied (not moved) from `~/Downloads/Econ 24-23`, `~/Downloads/Econ past paper `, `~/Documents/Econ HL 과외자료/paper` into `content/source/past-papers/`.
- Named from the PDF itself (cover date, IB paper code, level, time zone): `{M|N}{yy}_Economics_paper_{n}__{TZn_}{HL|SL|HLSL}[_markscheme].pdf`. Exact duplicates dropped; where two different copies existed, the one the index already pointed at was kept.
- Scans without a text layer go to `past-papers/scans/` with a `_scan` suffix.
- `content/past-paper-files.csv` maps each new name to its original locations. `exam-questions-index.csv` now points at the new names.

## AI Helper (Jin, 2026-09-17)
- Never gives the answer to a question, even when asked directly. It explains how to find the answer (which concept, which step next) and stops there. Server-side leak check before every reply.

## Past-paper questions as set questions (Jin, 2026-09-17)
- Jin wants original IB past-paper questions set as they are, alongside original and (later) variant questions.
- Question and mark scheme text is extracted from `content/source/past-papers/` into git-ignored `data/` and loaded into the local SQLite DB. It is never written to committed files. Figures and tables that don't survive text extraction are shown as images cropped from the PDF (also in `data/`).
- Every past item is classified by unit (and section/concepts where possible) from its content. Tags go in committed files; text does not.
- Helper and AI mark suggestions also work on past-paper questions. This sends IB text to the Gemini free tier, which may use inputs for training; Jin accepted this.
- If Onside is ever offered to other tutors, remove past-paper features until a licence is in place (HANDOFF §3).

## Hints, solving, set options (2026-09-17)
- Every past-paper item has two draft hints written in this session (`content/past-item-hints.json`, no paper text). Jin can edit any hint in the question bank; edits are stored in `hint_overrides` and survive re-seeding.
- Student solving: MCQ, Onside calculations and analysis chains are auto-checked (3 attempts). Every past-paper item and every written format is submitted once and marked by the tutor (AI suggestion later). Past-paper calculations take working plus a final answer.
- Helper: locked 90 s from first view; hints cost 100 → 90 → 70%; chat goes through `/api/helper` with a leak check. Asked for the answer, it explains the method and points to the next hint, never the answer. The free Gemini tier is often overloaded (503), so each tier falls back through other free models; if all fail the student sees "The Helper is busy".
- Set builder options: several units at once, sources (Onside / Paper 1 / 2 / 3), HL or SL papers, question types, papers from a year, search; "Add N random" spreads picks across the chosen units and skips the same question printed in two time zones.

## Review, marking, retries, AI questions, unit tests (2026-09-17)
- On submit, written answers get an AI mark suggestion in the background (quotes checked against the answer). Jin confirms per question or "Accept all AI marks"; "Send marks" makes marks visible to the student. Blank answers score 0 and count as neither with nor without AI.
- Review quiz: every question lost, helped or blank is proposed as a different question on the same concept/section (same skill first, unseen by the student, newest paper first). Jin can swap, leave out, or generate an AI question for that slot. Sending approves any AI question in it.
- Set builder: title follows the units; each question opens to show the full question and answer; paper range as yymm–yymm; sources "All / Past papers only / Past papers + new AI questions / New AI questions only". AI questions are drafts until a set containing them is saved; their hints get a light-model leak check.
- Student names never go to the AI: only question, mark scheme and the student's own text/photo.
- Unit tests: 30 original questions per unit (15 MCQ, 15 short answer, tables where useful) in `content/unit-tests/`, loaded as source `unit-test` and as preset sets "Unit N test" (Helper off). Diagrams are described in words, not drawn.

## Per-student unit tests (2026-09-17)
- Unit test questions are their own source ("Unit test questions") in the builder.
- Builder "For student": marks every question the student was already sent ("Sent") or answered ("Answered", with date; the same question in another time zone counts), hides them by default, and "Save and send to …" assigns the new set straight away. Random picks skip them.
- Student page "Unit tests": sent/answered out of 30 per unit, with "Send 10 new" (opens the builder prefilled: student, unit, unit-test source, 10 unseen questions). Preset pages have "Send part of this test".

## Claude as AI provider (2026-09-17)
- `src/lib/ai` picks Claude when `ANTHROPIC_API_KEY` is set (or `AI_PROVIDER=anthropic`), otherwise Gemini.
- Models per task: Helper and leak check → Claude Haiku 4.5; marking, diagram check and question writing → Claude Sonnet 5 (effort medium). Overridable in `.env.local`.
- Marking goes through the Message Batches API (half price; results within about an hour, polled every minute and when the review page opens). `AI_MARKING_BATCH=off` marks instantly.
- The system prompt (rules + question + mark scheme) is sent as a cached block so later Helper turns on the same question cost less.
- `HELPER_DAILY_LIMIT` (default 15) caps Helper questions per student per day; hints stay available.
- Estimated cost with this split: about US$2 per student per month at 10 questions a day (see the chat estimate of 2026-09-17).

## Sign-in with login ID and password (2026-09-17)
- Replaces the account picker. Tutor and students sign in with a login ID and password (scrypt hashes in the local DB; the cookie holds a random session token, 30 days; sign-out deletes it).
- 5 wrong passwords on one ID lock it for 5 minutes. Archiving a student or changing their password signs them out everywhere.
- Jin sets each student's login ID and password when adding them, and can reset the password on the student page.
- Accounts are set with `npm run account` (never in committed files): tutor `--tutor`, student `--name` or `--user <id>`. After `npm run db:reset`, run it again for the tutor.

## Stage 1 fixes (2026-09-17)
- MCQ is one submission, and the right answer is not shown until the tutor sends marks (replaced on 2026-09-18, below).
- Diagram questions are never sent to AI marking; Jin marks them.
- Timed sets (Helper off with a time limit) close on the server when time runs out; saves within 30 s of the deadline still count.
- Students: "To do" (sorted by due date) and "Done" lists; a start screen before question 1 (a set in progress resumes at the first unanswered question); a results page for each finished set with their answers, and after marks are sent, marks, tutor comments and answers.
- Helper chat stays when the drawer is closed; while the Helper is locked the input shows, disabled. Hints and the Helper close once a question is submitted. Failed Helper replies don't count as AI use.
- Review quiz: only after marks are sent; the quiz set records the set it came from (`sets.review_of`), and the page warns before a second one.
- Unit test presets can't be edited or deleted (use "Send part of this test").
- Delete set, Unsend, Archive student, Accept all AI marks and Send marks ask for confirmation.
- Concept status is per set for now (the 3-set rolling window in the spec is not built yet).
- Students choosing their own review questions: not built (Jin, later).

## Submit once per set (2026-09-18)
- Questions have no Submit button. Students move with Next / Previous or the question numbers, and press Submit assignment at the end (or at the top). Answers save automatically and can be changed until then.
- On submit, every answered question is submitted; MCQ, calculation final values and analysis chains are checked once at that moment (no 3 tries, no Correct/Incorrect while solving).
- A question number turns black once it has an answer (a chosen option, any typed text, a plan or a photo). The submit dialog says how many have no answer.

## Concept board (2026-09-18)
- Tutor tab "Concepts" (straight to the board when there is one student) and `/tutor/students/[id]/concepts`.
- Each concept or section is judged on the last 3 sets with sent marks that tested it, using the rules in docs/scoring-rules.md. The Students list uses the same counts; the review page still shows the one set.
- The board shows counts, the weak spot, a unit overview (sections not tested yet), a status filter, and per concept the last 3 sets as coloured squares linking to each review.
- Accounts stay as they are: Jin adds the student. No sign-up page (one student).

## Vercel + Supabase (2026-09-18)
- Jin chose Vercel for hosting, with a new Supabase account for the database and files (free tiers).
- The database moved from SQLite to Postgres. Local development and tests use an embedded Postgres (PGlite) in `data/pglite`.
- Extracted past-paper text and figures now also live in the private Supabase database and storage bucket (needed for the hosted app). They are still never committed. Row level security blocks Supabase's public API.
- Sign-in lockout (5 wrong passwords → 5 minutes) is stored in the database, since Vercel runs many short-lived server instances.
- AI marking runs with `after()`; "marking in progress" is stored on the assignment. Batch results are collected when the tutor opens pages (no always-on timer).
- The Helper's daily limit counts from midnight Singapore time.
- Diagram photos are shrunk in the browser (≤ 2000 px JPEG) before upload because of Vercel's request size limit.
- Steps: docs/deploy.md.
