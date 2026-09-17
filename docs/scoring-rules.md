# Scoring rules

## Question level
- **Hint cap:** no hint 100%, Hint 1 opened 90%, Hint 2 opened 70%. AI questions don't reduce the cap.
- **Question score (marks)** = confirmed marks × hint cap. Auto formats: confirmed = auto result.
- No per-question submit (Jin, 2026-09-18). Answers save as the student works and can be changed until the student submits the whole set. Every answer is then checked once: MCQ, calculation final value and analysis chain are auto-marked (no retries, no feedback before submitting); written formats go to marking.
- An analysis chain counts as answered only after the student moves a step or presses "Keep this order".

## Help category per question
| Category | Rule | Tutor pill |
|---|---|---|
| Without AI | No hint, no AI question, no honesty flag | ink "Without AI" |
| With AI | Hint opened or ≥1 AI question | highlighter "With AI" |
| Unverified | No Helper use, but a flag: paste ≥ 40 characters into an answer field, or away from the tab ≥ 60 s in total on this question | outlined "Unverified" |

Thresholds are starting values; make them config.

## Set level
- **Supported score** = Σ question score ÷ Σ marks available.
- **Independent score** = Σ confirmed marks on *Without AI* questions ÷ Σ marks available.
- Also show counts: `Solved without AI: 2 of 5`, `Unverified: 1`.
- Result line: `{marks}/{total} marks | {n} of {m} without AI | Weak spot: {concept}`.
- Scores that include unconfirmed AI marks show as "pending" to the tutor and are hidden from the student.

## Concept status (per concept, rolling over the last 3 sets that include it)
The concept board (`/tutor/students/[id]/concepts`) and the Students list use the last 3 sets with sent marks that tested the concept (Jin, 2026-09-18). The review page shows the same rule for that one set.
- **Solid:** ≥ 80% of available marks, all on Without AI questions.
- **Shaky:** correct only with help, or 50–79% without help.
- **Needs work:** < 50%, or the same marking point or MCQ misconception missed again after help.
- **Weak spot** on the result line = the Needs work concept with most marks lost; if none, the Shaky one.

These are first rules. Jin adjusts after real use.
