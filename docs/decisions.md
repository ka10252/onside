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

## Daily practice (2026-09-24)
- A student can have a schedule: on/off, which days, how many questions, from unit tests / past papers / both, one unit or every unit, Helper on/off, and when it is due. It lives on the student's page.
- `/api/cron/daily` builds and sends the set, and only sends what is due. The tutor picks the send time, so GitHub Actions calls the route every 15 minutes (Vercel's free cron is once a day, to the hour, and stays as a backstop). `CRON_SECRET` keeps anyone else from calling it.
- Questions are ones the student has never been sent; essays are left out. The run records the Singapore date, so a second call the same day sends nothing. "Send one now" is there for trying it.

## Daily practice: time and unit plan (2026-09-24)
- The schedule holds a send time and a deadline (days ahead plus an optional time of day), both Singapore time. A due date can now carry a time (`2026-09-26T21:00`); `src/lib/due.ts` reads and formats both shapes.
- The units rotate through a plan the tutor writes, one entry per send, repeats allowed (Unit 1, Unit 2, Unit 2, …). It starts again at the top, and the schedule remembers its place. With no plan, questions come from every unit (or the single unit set below it).

## Daily practice: the calendar is the schedule (2026-09-24)
- The student's page shows four weeks. A day is set by clicking it: a unit for that day, "don't send", or back to the plan. Those choices are kept per date in `schedules.overrides` and win over the weekly days and the rotation; a hand-set day doesn't move the rotation along.
- The questions for a day are only shown when the tutor asks for them, from the day they clicked.
- The student's details (name, login, password, archive) sit behind their name at the top of the page, so the rest of the page is about their work.

## Daily practice: more than one set a day (2026-09-24)
- A practice day has a list of send times (`schedules.times`, defaulting to `send_at`), so a student can get, say, one set in the morning and another in the evening. Each set draws its own questions and the unit rotation moves on one step per set.
- A day set by hand on the calendar holds a list too: each entry has its own time, unit and number of questions.
- `schedules.sent_slots` records which times have gone out on which date, so a run that fires several times a day never sends the same slot twice.

## A page must never hang (2026-09-27)
The site kept ending a long wait with "something went wrong", on any screen, with no pattern to which one. Three causes:

- **Too many queries handed to the driver at once.** This was the main one. Against Supabase's transaction pooler, nine queries issued together over a pool of three never come back — no answer and no error. Nine over a pool of nine is fine, and so is nine one after another, so it is the queue behind each connection that breaks, not the count. Every page that loads its data with `Promise.all` was rolling that dice; the tutor's student page, with seven loaders and two more queries, lost most often. It hid from every measurement because the timing route asked for things one at a time. `src/lib/db.ts` now lets only `POOL_MAX` queries be in flight and holds the rest in a queue of its own. Measured against the real database: nine at once used to hang, now 460 ms; forty at once, 728 ms.
- **A connection that died while the instance slept.** Vercel freezes an instance between requests and the database closes the connection it was holding. On waking, a query goes out on a socket nobody is listening to: no answer, no error, and the driver waits until the function's own limit. So every query gets a deadline of 8 s (`src/lib/db.ts`). Past it the pool is dropped, the next call opens a fresh one, and reads are asked again — writes are not, because a write that timed out may still have landed. Opening a pool proves itself with a short query (`firstContact` in `src/lib/db-core.ts`); four connections per instance (`POOL_MAX`), let go after 10 idle seconds or 5 minutes of life.
- **A page left behind by a new deployment.** Vercel gives each deployment its own Server Action addresses, and Skew Protection is paid. `/api/version` reports which build is serving; `StaleBar` in the root layout checks it every minute while the tab is in front and says so before a button is pressed. Saving a set and the calendar's buttons report it in place rather than throwing the page away.

What a person sees now: a page frame straight away (`loading.tsx` on both sides), a line after 6 seconds saying it is taking longer than usual, and — if it still fails — one silent retry before any error screen. Only a second failure shows one, with the code the server logged it under. Deploy while the tutor is working and it will still interrupt them, so don't.

## The AI drafts the comment the student reads (2026-09-27)
AI marking already covered short answers, calculations, essays and past-paper questions: marks, band, the marking points met with the student's own words quoted back, and what was missed. All of that was written for the tutor. Nothing was written for the student, so accepting a suggestion sent a mark with no words at all.

The marking prompt now also returns `comment_for_student`: one to three sentences about that answer — what earned the marks and what it needed for the rest, naming the economics, in plain sentence case with no greeting and no praise. It fills the comment box on the marking screen; the tutor edits it, replaces it, or clears it, and "Use the draft" puts it back. Only what the tutor confirms reaches the student. "Accept all AI marks" now sends those comments too, and says so before it does.

Diagrams are still marked by hand (Jin, 2026-09-17), so they get no draft.
