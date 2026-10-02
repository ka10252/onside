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

## Results are counted in questions, not percentages (2026-09-28)
A share of a mark total says less to a student than "two of five on your own", so no screen shows a percentage any more. Independent and Supported are counts of questions taken for full marks — Independent counting only the ones done with no hint and no Helper — both out of the questions in the set. A question worth 3 of 4 counts in neither; part marks live in the marks fractions beside them (`18 of 30 marks`, `Without help 12/16`). The tutor's trend bars keep their heights, which are a picture, and label each bar with its marks.

## Marking a question, side by side (2026-09-28)
The marking screen had the question hidden behind "Show question and mark scheme" at the bottom, under seven headings — Attempts, Diagram, AI summary, Plan, Working, Answer, Marking. Marking means holding the question and the answer together, so the question and its mark scheme are now on the left, what the student wrote on the right, and the marking underneath. Below 860 px the two columns stack.

Nothing a tutor needs in order to mark is behind a button any more: the question is the whole question as the student had it (the extracts open, the data table, every multiple-choice option in its own order with the one they picked and the right one marked, the steps of an analysis chain), and under the answer come the marks, the AI's reading of it, the mark scheme and the whole Helper conversation. Only the writing snapshots stay folded, because there can be dozens and they are a record rather than marking material. `Choices` draws the options for both the tutor's screen and the student's results.

## The practice calendar shows any month (2026-09-28)
It used to show four weeks from this Monday and nothing else, so a plan could not be looked at ahead or checked afterwards. It now shows a month at a time — whole weeks from the Monday on or before the 1st to the Sunday on or after the last day, with the days either side greyed — and the tutor steps through months with arrows, a dropdown of the year and a half around this month, or "This month". The month rides in the URL as `?month=2026-10`, so a link to a month can be kept and the page's other options survive the move. Days in the past show what went out and nothing to set. `practiceMonth` in `src/lib/practice-calendar.ts` builds it; `upcomingSends` is asked for enough days to reach the end of whichever grid is on show.

## A day set by hand sends, whatever the switch says (2026-09-28)
Three days were set on the calendar while "Send automatically" was off. The calendar drew none of them and the runner sent none of them, because both asked `enabled` first. Setting a date is the tutor pointing at that date; the switch is only about the weekly days. `sendsOn(schedule, date)` is now the one rule — a hand-set day sends on its own, weekly days send only while the switch is on, a day set aside sends nothing — and the runner, `upcomingSends`, the tutor's calendar and the student's calendar all ask it. A day that sends nothing no longer moves the unit rotation on.

Separately, "Send one now" wrote the date into `sent_slots` with no time, and `sentTimes` read that empty record as "the morning set went out", which stopped that day's real set. A date present in the log is now the record, empty or not; the old one-send-a-day fallback applies only to dates the log has never heard of.

## The tutor can read the student's screen (2026-09-28)
After marking, "See 도원's screen" on the marking page opens `/tutor/students/[id]/a/[assignmentId]/student-view`: the results page the student reads, the same component, not a rebuilt likeness. `Results` in `src/components/student/Results.tsx` holds it; the student's page and the tutor's route each supply where its links point and where the way back goes. Nothing is hidden or added for the tutor, so before the marks are sent the tutor sees exactly the blank the student sees.

## The red pen tells help apart from no help (2026-09-28)
A circle on a student's results now means full marks reached on their own. Full marks with a hint or the Helper gets a triangle, the same as part marks: it scored, but not unaided. Only a blank stays unmarked and only nothing at all is a cross.

The two blocks under the set's marks are both out of the marks in the whole set, not out of the marks available in each half. "Without help 12/30, With the Helper 6/30" reads against the set's 18/30 and adds up to it; the old denominators (12/16 and 6/14) were two different scales and answered a question nobody was asking.

## Finished sets sort two ways (2026-09-28)
The Done tab groups by unit, which is right for revising a topic and wrong for checking what was just marked. Two chips now choose: "By unit" keeps the headed groups, "Newest first" drops them and runs by the date submitted. The choice rides in the URL as `?sort=new` beside the tab and the unit filter, and by unit stays the default.

## A message when a student submits (2026-09-28)
Telegram (Jin, 2026-09-28): free, arrives as a push on the phone, and needs no domain or verified sender, which email would. `src/lib/notify.ts` posts to the Bot API and does nothing at all unless `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are both set, so local runs and tests never send. `finalizeAssignment` fires it through `after()` beside the AI marking, and a failure is logged and swallowed — a notification is never worth failing a student's submit for. The message says who submitted, which set, how many questions, how long it took, what help was used, and links to the marking screen. Setup and `npm run notify:test` are in docs/deploy.md.

Only on submit for now. Marking finishing, and overdue sets, were offered and left out.

## Lessons are the tutor's own room (2026-10-01)
A lesson is prepared, taught and reviewed at `/tutor/students/[id]/lesson`, and the student sees none of it until a review quiz is sent. It shares nothing with daily practice — its own `lessons` and `lesson_items` tables, no reading or writing of `schedules` — so preparing a lesson can never change what goes out in the morning (Jin, 2026-10-01).

Two screens, not one (Jin, 2026-10-02). **Prepare** is the tutor's, with the answer sitting beside every question it holds — mark scheme, model answer, the right option marked. **Teach** is for the screen the student reads over their shoulder: one question at a time, large, with the extracts and the options in their own order and nothing that gives an answer away. It is not hidden with CSS — `teachView` never fetches the answer, so there is nothing in the page's data to find. A check of its output: no `answer`, `right`, `marking` or `hints` anywhere, and multiple-choice options carry no flag.

The preparing screen opens with what the past papers actually ask of that unit: the diagrams by how often they are asked for, the command terms, the terms asked to define, and how many past questions are held by length. All counted from `past_items`, not judged. The tutor picks questions from the unit's past papers, marks each one as it goes ("Got it" / "Missed"), and keeps private notes.

**The review quiz** is the questions missed in the lesson plus others on the same ground — same section first, then the rest of the unit, never one the student has already been sent — ten in all, multiple choice and short answers only. A missed essay is not re-asked: a review quiz checks a hole has closed, it is not another essay. Multiple choice comes from the unit tests because the IB sets none; everything else is past paper. It goes out as an ordinary assignment with the Helper off, and the lesson remembers which one it was so it cannot be sent twice.

Essay outlines are not submitted through Onside — Jin takes those himself and gives feedback directly (Jin, 2026-09-28).

## Units are ranked by how much of the exam they carry (2026-10-01)
637 past-paper questions across M22–N25, every one tagged to a unit. Unit 16 carries 85, unit 1 carries 7, and the top seven units are 54% of the exam between them. `src/lib/unit-weight.ts` counts it; the question bank badges each unit with its rank, and the student's page weighs that against how they are doing — a unit that carries a lot and has gone badly, or has never been tested, is the one to teach next. A unit they are solid in drops down rather than sitting at the top for ever.

## The question mix is derived, not decided (2026-10-02)
Each unit's lesson template — how many multiple choice, short, explanation and essay questions — is worked out from what that unit's past papers actually ask for, by grouping their command terms into calculation, explanation, evaluation and definition. Unit 8 comes out 9 short and 1 explanation because two-thirds of its items are calculations; unit 9 comes out 10 explanations because 87% of its items say explain; unit 20 gets two essays because 59% ask to evaluate; unit 18 gets 8 short because 62% ask to define. Nothing is typed in by hand, so adding a session's papers moves the templates with it.

Ten questions make a lesson, with the multiple choice a warm-up on top (two to six, from the unit tests, since the IB sets none). "Fill from the template" picks them from the unit's past papers, skipping anything the student has already been sent, and says when a unit has run too thin to fill — units 15 and 17 already have, which is the measured reason to teach them with 14 and 16.

## Revision notes live in the database, written outside the repo (2026-10-02)
The notes a tutor teaches from — what to emphasise in a unit, the answer shape the papers reward, the mistakes students make — are written from Jin's own teaching materials and the past papers, so the text cannot sit in a committed file. They are written as markdown in `content/source/수업준비/U<n>-*.md` (git-ignored) and loaded into `unit_briefs` by `npm run brief:load`, which is how they reach the app on Vercel.

The notes are in two halves, split in the file by a `<!-- tutor only -->` line (Jin, 2026-10-02). Above it is **what the student reads, written in English**, since the teaching screen is a screen they read over the tutor's shoulder: the answer shape the papers reward, which curve moves and why, the mistakes that cost marks, the definitions, the essay skeleton. Below it is **the tutor's**: how heavily the unit is examined, how much stock is left, the lesson's timings, how to run the drills, and which questions are the same question in two time zones. The teaching screen is never given the tutor half — it is a separate column the lesson screen does not fetch.

Both lesson screens show them: the preparing screen puts them at the top, where a lesson is actually planned; the teaching screen makes them its first step, a Revision tab before the Questions, so going over a unit and asking about it are two deliberate moves rather than one page. `src/components/Notes.tsx` renders the markdown — headings, lists, tables, quotes and fenced blocks, which is every shape the notes use.

## A question carries only the extract it names (2026-10-02)
A Paper 2 question comes with the whole stimulus — three texts, two tables, a figure, nineteen blocks — because that is how the paper prints it. But a two-mark calculation that says "using Table 1" needs Table 1, and sending the other eighteen blocks buries the question it is attached to.

`src/lib/extract.ts` reads what the wording names — "Table 1", "Text A, paragraph 4", "Figure 2" — and keeps those blocks with their headings. A question that names nothing keeps everything, and so does the essay formula "using information from the text/data", which means all of it. If the references match no block it keeps everything rather than hand back nothing. Measured over 134 past questions: 1,704 blocks down to 498, a 71% cut, with every essay untouched.

## A lesson is taken across the papers, not down one (2026-10-02)
Filling a unit 16 lesson picked nine Paper 2 questions, one Paper 1 and no Paper 3 at all, though nineteen Paper 3 questions were sitting in that unit — the questions were being taken in id order, which runs session by session. The papers now take turns within each band, newest session first, so a lesson is three papers' worth of practice.

## The answer box is the size of the answer (2026-10-02)
Every written answer was a 180-pixel textarea, whether it was worth two marks or fifteen. A calculation's result and anything worth two marks or less is now a single line; four marks gets a small box, five to nine a larger one, an essay the full height. A student should be able to tell how much to write from the space they are given.

## Revision notes carry their diagrams, and print (2026-10-02)
Emphasis in a note is semi-bold rather than bold: it should lift a phrase, not shout. The diagrams the notes lean on are drawn rather than described — `src/components/Diagram.tsx` holds them as SVG, so they follow the page's colours in both themes and print cleanly, and a note places one with a line of its own (`:::diagram ad-as  caption`). Two exist so far, the exchange rate diagram and AD/AS, which are between them the diagrams of the two heaviest units.

Each note opens with three things to take away rather than a paragraph saying what it covers, because a student reading it before a lesson should come away with three sentences if nothing else.

`/tutor/students/[id]/lesson/print?unit=N` is the notes alone, laid out for paper, with the browser's own Save as PDF doing the export. No questions are on it, so it can be given to a student before the lesson.

`scripts/cover.ts` checks the other direction: it takes the questions the template picks for a unit and asks whether the note covers what each one leans on. Unit 16's essay turned out to ask about unemployment, which the note had dropped when it was cut to twenty minutes.
