# Onside design system

This file describes the look of the Onside mockups and demo. Build the real tool to match it. The CSS values are in `tokens.css` (colour and font variables) and `components.css` (every component style in the demo). Class names in those files match `../reference/onside-demo.html`.

Direction: **"Highlighter"**. The look is a clean study notebook with one highlighter pen. Text is dark ink on warm off-white paper, and one fluorescent yellow-green marks where help was used.

---

## 1. Colour

Almost everything is neutral. Each colour has one job.

| Token (CSS var) | Hex | Job |
|---|---|---|
| `--bg` ground | `#F7F6F1` | Page background. Warm off-white. |
| `--surface` | `#FFFFFF` | Cards, panels, dialogs, drawer |
| `--surface2` | `#FAF9F5` | Table headers, sub-bars, input fields |
| `--sunk` | `#F0EFE8` | Avatars, grey pills, Helper reply bubbles |
| `--line` / `--line2` | `#E2E0D6` / `#CAC7BA` | Hairlines, card borders / input and secondary-button borders |
| `--ink` | `#141414` | Main text, primary button. **Also marks work done without AI.** |
| `--ink2` | `#55544E` | Secondary text |
| `--faint` | `#8A887E` | Decorative only, never text |
| `--hl` highlighter | `#E4F86A` | **Help was used.** Hints, "With AI" tag, supported score boxes. Also the marker stroke under the logo. Text on it is always ink. |
| `--hlborder` / `--hllabel` | `#C9DE45` / `#3E4A00` | Border of highlighter cards / small labels on highlighter ("Hint 1 of 2") |
| `--pink` | `#FF6FAE` | **The tutor's one main action per screen** ("Create review quiz", "Send to Mina"). Ink text. |
| `--pinktint` / `--pinktext` | `#FFE3EE` / `#9E1F4F` | "Targets" note on quiz questions |
| `--red` / `--redtint` / `--redtext` | `#C8322B` / `#FDE7E5` / `#9A231D` | Needs work, wrong answer, "Needs review" pill |
| `--amber` / `--ambertint` | `#8A5F00` / `#F7EED3` | Shaky, "In progress" pill |
| `--green` / `--greentint` | `#2E7D4F` / `#E5F2E9` | Solid, correct, "Reviewed" pill |

Rules:

- **Ink means independent work, and highlighter means AI help was used.** This pairing runs through the whole product: the Q boxes, the "Without AI" / "With AI" pills and the score pair.
- A status always has an icon and a word. Colour alone never carries meaning.
  - Solid: filled check circle
  - Shaky: half-filled circle
  - Needs work: triangle
- Use pink once per screen, and only on the tutor side.
- No gradients, except the highlighter marker stroke behind the logo.

## 2. Type

| Role | Font | Where |
|---|---|---|
| Display | **Instrument Serif** 400 (never bold) | Logo, page titles (h1), card titles (h2), big numbers (scores, countdown) |
| Text | **Instrument Sans** 400–700 | Everything people read: questions, hints, answers, chat, AI summaries, tables, buttons, labels |

Both fonts are free on Google Fonts. Fallbacks are Georgia for the display font and Arial for the text font.

**Jin decided this rule after reviewing the demo.** Anything a person has to read through goes in the sans font. This covers question text, hints, working, answers, the chat log and AI summaries. The serif is only for headings and big numbers. Do not use italic serif for student input.

Sizes used in the demo:

| Element | Size |
|---|---|
| Page title | 46px serif |
| Card title | 26–28px serif |
| Score number | 60px serif |
| Question text | 28px sans, 500 weight |
| Hint text | 16–17px sans |
| Body text | 15px sans |
| Labels | 13–14px sans, 600 weight |

## 3. Layout

- The site uses an ordinary website structure. Jin rejected an earlier notebook-style layout as hard to navigate.
  - White top bar (64px): wordmark, one tab, avatar on the right
  - Breadcrumbs, then the page title
  - Stacked cards in a 1120px column, 20–24px apart
- Cards: white, 1px `--line` border, 12px radius, soft `--shadow`.
- Buttons and inputs: 8px radius, 44px+ tall. Pills and chips are fully rounded.
- **Student question page:** one narrow centred column with nothing else competing for attention.
  - No timer, no score deductions and no Helper panel sitting open.
  - The Helper is reached through a small text link, "Stuck on a step? Open the Helper", and opens as a right-hand drawer.

## 4. Components

| Component | What it looks like | Demo class |
|---|---|---|
| Wordmark | "Onside" in serif, about 30px, with the highlighter marker stroke on the lower 42% | `.logo` |
| Question stepper | Numbered circles 1–4, small green check dot when answered | `.stepper` |
| Hint note (on the question) | Collapsible highlighter card, "Hint 1" | `.hintnote` |
| Feedback banner | Green "Correct." / pink-red "Not quite." + attempts left | `.fb` |
| Helper drawer | Right drawer: title, "Your tutor can see how you use the AI Helper.", then the hint zone, then the chat | `.drawer` |
| Locked Helper | Ring countdown (90s), "Give it a proper try first.", "Back to the question" | `.lockbox`, `.ring` |
| Hint card | Highlighter card: "Hint 1 of 2" label, hint text, chips "I don't get this hint" and "Open Hint 2 · last hint" | `.hcard`, `.chips` |
| Hint confirm dialog | "Open Hint 2?" and the max score drop "90% → 70%" | `.dialog`, `.drop` |
| Chat | Student bubbles in ink (right), Helper replies in sunk grey (left), "Hint 1 opened · 00:06" divider | `.msg`, `.marker` |
| Score pair | Independent (ink outline) and Supported (soft card): big serif %, "Solved without AI: 1 of 4", Q1–Q4 boxes (ink = no AI, highlighter = with AI, dashed = neither) | `.scores` |
| Result line | One plain line: **4/4 correct \| 1 without AI \| Weak spot: *Chain rule*** | `.headline` |
| Question row | Q, question, result, score, With/Without AI pill, hint pips, AI question count, time, status, chevron | `.qrow` |
| AI summary | 2–3 short bullets, never a paragraph | `.summary` |
| Conversation log | Time, speaker, text; hint-open markers as highlighter lines | `.convo` |
| Quiz card | Type pill, question, options, "Targets: …" pink note, Edit/Regenerate/Remove | `.qc`, `.why` |
| Toast | Small dark pill at the bottom | `#toast` |

## 5. Voice

- Plain, short and specific. Use sentence case everywhere.
- Buttons say the action: "Check answer", "Open Hint 2", "Send to Mina".
- **Tutor-facing results are blunt facts, not sentences.** Jin rejected "All 4 answers correct — but Mina needed help with the chain rule in 3 of them." Use "4/4 correct | 1 without AI | Weak spot: Chain rule".
- **AI summaries are short bullets.** Jin said fluffy summaries that take up space are unwanted. For example:
  - Missed: inner derivative (×2)
  - Fixed after 2 AI prompts + Hint 1
  - Asked for the answer once — refused
- Remove explanatory copy that isn't needed. Jin asked for this explicitly.
- The AI Helper is short, answers with a question, never praises, and **never gives the final answer**.
- Don't use:
  - Emoji
  - "Awesome!"
  - ALL CAPS labels
  - Decorative numbering (01 / 02)
