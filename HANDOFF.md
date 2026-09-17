# Onside for IB Economics HL — handoff v2

> **To Claude in Claude Code:** read this file, then `CLAUDE.md`, `design/design-system.md`, and the docs in `docs/`. Open `reference/onside-demo.html` and `reference/screens/`. The demo is the source of truth for look and flow. This v2 replaces v1 (which was written for IB Maths). Decisions below were made with Jin; don't reopen them without asking.

## 1. What this is

Onside is a homework and review tool for tutors. Jin tutors IB Economics HL. The first user is an HL student preparing for final exams. The tool lets the student use AI only inside Onside, only as hints and follow-up questions, and logs everything so Jin sees what the student can do alone.

Pitch line: "AI-polished homework hides what a student can't do." The design, voice and components from the v1 demo stay the same (Highlighter direction, website layout, sans for anything read, serif for headings and big numbers).

## 2. Decisions (keep)

### Carried over from the demo
- Student page has minimal distractions: no timer, no score deductions shown, Helper closed by default.
- Helper is a small text link that opens a right drawer, locked for 90 s with a countdown ring.
- Hints and "Ask AI" live in one panel. Two hint levels. Opening a hint asks for confirmation and shows the max-score drop (100 → 90 → 70%). AI questions don't cost points.
- The AI never gives the final answer. Asked for it, it refuses and points to the next hint.
- Tutor sees Independent and Supported scores, a blunt result line, 2–3 bullet AI summaries, the full conversation log.
- Student list shows several students.

### New for IB Econ
- **Content hierarchy:** Part → Unit → Section → Concept → Question.
  - Parts: Micro, Macro, Global economy, Economic development.
  - Units are the chapters in Jin's notes (1–20). Unit 1 (Introduction) sits under Micro for now; confirm with Jin.
  - Mapping: Micro 1–7, Macro 8–13, Global 14–17, Development 18–20.
  - In the UI, show the Part and Unit names; don't use the word "Unit" for Parts.
- **Two modes**
  - *Assigned:* Jin builds a set and assigns it (demo flow).
  - *Review:* the student picks a Part/Unit/Section and gets a mixed-format set. A map shows concept status (Solid / Shaky / Needs work) per Unit. Wrong questions come back as a *different* question on the same concept, not the same one.
  - Helper logging works the same in both modes, and both feed the tutor view.
- **Formats (v1 ships all):** MCQ, short answer (definitions, 2–4 mark explains, P1(a) 10-mark), calculation, diagram (hand-drawn photo upload), analysis chain (order the steps), essay (P1(b) 15-mark, with a Plan → Write step).
- **Marking**
  - MCQ, analysis chain, calculation final answers: auto.
  - Everything written: AI suggests marks against the mark scheme or model answer with quoted evidence from the student's answer; Jin confirms. The student sees marks only after Jin confirms (early AI feedback would leak marking points).
  - Diagrams: AI checks the photo against a label checklist; Jin always confirms.
  - Calculation working marks: AI suggests, Jin confirms.
  - Written answers are submitted once. The "3 attempts" rule applies only to auto-marked formats.
- **Honesty signals (the reason this build exists)**
  - Log paste events (characters pasted, into which field), tab/window blur (count and total time away), time per question.
  - Snapshot essay/long-answer text every ~20 s so Jin can replay how it was written.
  - A question with a large paste or long time away is shown as **Unverified**, not "Without AI".
  - Tutor row example: `Pasted 1 answer · Left tab 4× (6 min)`.
  - "Helper off, timed" sets for use in or right before a lesson.
  - Student-facing notice stays: "Your tutor can see how you use the AI Helper." Extend it to mention paste and tab activity.

## 3. Content in this repo

| Path | What |
|---|---|
| `content/syllabus-tree.json` | Part → Unit → Section → Concept tree auto-extracted from Jin's notes. Units 4, 14, 15, 17–20 are marked `thin` and need a manual pass. |
| `content/units/16-exchange-rates-bop.json` | **First complete unit pack** (the template for all others): 22 concepts, 3 diagram checklists, 15 original questions in every format with hints and marking, links to related past-paper items, and 2 corrections to Jin's notes. |
| `content/exam-questions-index.csv` | 637 past-paper items M22–N25 (P1–P3, HL and SL): marks, command term, diagram type, defined term, unit tags, and **file + page for the question paper and mark scheme**. No question text. |
| `content/exam-frequency.md` | HL frequency by Part, Unit, paper; P1 topic pattern; diagram counts; calculation counts. Use it to order review. |
| `content/past-paper-index.md` | Which sessions/papers exist. Complete M22–N25; M26 missing. |
| `content/content-inventory.csv` | Every file in Jin's tutoring folder, classified. |
| `content/coverage-gaps.md` | Gaps in notes, diagram keys and marking material. |
| `content/source/` | **Jin copies his PDFs and notes here locally. Git-ignored. Never commit.** |

### Past papers and copyright
The IB PDFs carry a licence notice that restricts use by tutors, tutoring services and app developers. Jin decided to use them for his own tutoring. Rules for the build:
- Keep PDFs in `content/source/` only (git-ignored), and keep the repo private.
- Don't copy question text or mark scheme text into the database or seed files. Store the pointer from `exam-questions-index.csv` and render the original PDF page from Jin's local files when a past question is needed.
- Question banks are built from Jin's own notes plus **original** questions in IB style. Don't reword past questions into "new" ones.
- If Onside is ever offered to other tutors, remove past-paper features until a licence is in place.

## 4. Scoring
See `docs/scoring-rules.md`. In short: marks-based. Question score = marks awarded × hint cap. Independent = marks on questions with no hints, no AI questions and no honesty flags ÷ total. Supported = all marks ÷ total.

## 5. AI
See `docs/ai-prompts.md` for Helper, marking, diagram check, tutor summary and question generation prompts.
- Server-side only. The API key never reaches the browser.
- The mark scheme / model answer is sent to the model but never returned to the student. Before a Helper reply is shown, run an overlap check against the model answer and marking points; block and regenerate if it leaks.
- Pre-generated, Jin-approved question variants are the default for "try a similar question". Live generation is a fallback, and its output goes to Jin for approval before the student sees it.

## 6. Proposed stack (confirm with Jin before scaffolding)
- Next.js (App Router, TypeScript) on Vercel.
- Supabase: Postgres, auth (email magic link + invite code for students), storage (diagram photos, private bucket), Singapore region.
- Anthropic API via server routes. Check current model names and pricing in the docs before choosing; a larger model for marking and generation, a smaller one for overlap checks is a sensible split.
- Styling from `design/tokens.css` and `design/components.css`, class names as in the demo.

## 7. First slice
1. Seed: syllabus tree + unit 16 pack.
2. Jin logs in, sees the unit 16 bank, builds a set, assigns it.
3. Student logs in, answers mixed formats, uses the Helper (90 s lock, hints, chat), uploads a diagram photo, submits. Paste/tab/snapshot logging is on.
4. Jin reviews: result line, score pair, concepts to watch, per-question log, AI mark suggestions to confirm, honesty flags.
5. Then: Review mode map, remaining unit packs, past-paper pointer viewer, review quiz generation.

## 8. Open questions for Jin
- Unit 1 placement.
- Hosting account ownership and domain.
- Whether parents get any view.
- Which units to pack next (suggested by frequency: 7 Market power, 10 Unemployment & inflation, 13 Policies, 5 Market failure).
