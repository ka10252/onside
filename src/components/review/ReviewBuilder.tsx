"use client";

import { useState, useTransition } from "react";
import type { BankQuestion } from "@/lib/admin";
import { sendReviewQuiz } from "@/lib/admin-actions";
import { generateQuestions } from "@/lib/builder-actions";
import { Rich } from "../Rich";
import { PreviewPanel, QuestionLine } from "../QuestionPreview";

export type ProposalView = {
  n: number;
  questionId: string;
  prompt: string;
  label: string | null;
  format: string;
  marks: number;
  reason: string;
  unit: number;
  candidates: BankQuestion[];
};

const aiFormat = (f: string) => (f === "mcq" ? "mcq" : f === "calculation" ? "calculation" : f === "essay" ? "essay" : "short_answer");

export function ReviewBuilder({
  studentId,
  studentName,
  fromAssignmentId,
  defaultTitle,
  proposals,
}: {
  studentId: string;
  studentName: string;
  fromAssignmentId: string;
  defaultTitle: string;
  proposals: ProposalView[];
}) {
  const [title, setTitle] = useState(defaultTitle);
  const [helper, setHelper] = useState<"on" | "off">("on");
  const [lists, setLists] = useState(() => proposals.map((p) => p.candidates));
  const [pick, setPick] = useState<number[]>(() => proposals.map((p) => (p.candidates.length ? 0 : -1)));
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const chosen = pick.map((k, i) => (k >= 0 ? lists[i]![k] : undefined)).filter((q): q is BankQuestion => Boolean(q));
  const first = studentName.split(" ")[0];

  async function generate(i: number) {
    const p = proposals[i]!;
    setBusy(i);
    setNotes((n) => ({ ...n, [i]: "" }));
    try {
      const res = await generateQuestions([p.unit], 1, [aiFormat(p.format)]);
      if ("error" in res) return setNotes((n) => ({ ...n, [i]: res.error }));
      const q = res.questions[0]!;
      setLists((ls) => ls.map((l, j) => (j === i ? [q, ...l] : l)));
      setPick((ks) => ks.map((k, j) => (j === i ? 0 : k)));
      setOpen(i);
    } finally {
      setBusy(null);
    }
  }

  function send() {
    setError(null);
    start(async () => {
      const res = await sendReviewQuiz({
        studentId,
        fromAssignmentId,
        title,
        helper,
        questionIds: chosen.map((q) => q.id),
      });
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="t3grid">
      <aside className="card settings">
        <div className="field">
          <label htmlFor="title">Title</label>
          <input id="title" className="answer" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <fieldset>
          <legend>AI Helper</legend>
          <div className="seg">
            <label>
              <input type="radio" name="helper" checked={helper === "on"} onChange={() => setHelper("on")} />
              On
            </label>
            <label>
              <input type="radio" name="helper" checked={helper === "off"} onChange={() => setHelper("off")} />
              Off
            </label>
          </div>
        </fieldset>
        <p className="meta" style={{ margin: 0 }}>
          <span>
            <b style={{ color: "var(--ink)" }}>{chosen.length}</b> questions
          </span>
          <span>
            <b style={{ color: "var(--ink)" }}>{chosen.reduce((s, q) => s + q.marks, 0)}</b> marks
          </span>
        </p>
        {chosen.some((q) => q.source === "ai") && <p className="note">Sending approves the AI questions in this quiz.</p>}
        {error && <p className="formmsg bad" role="alert">{error}</p>}
        <button type="button" className="btn accent lg" onClick={send} disabled={pending || chosen.length === 0}>
          {pending ? "Sending…" : `Send to ${first}`}
        </button>
      </aside>

      <div className="stack">
        {proposals.length === 0 && (
          <div className="card empty-state">
            <h2 className="serif" style={{ margin: 0, fontSize: 26, fontWeight: 400 }}>Nothing to review</h2>
            <p className="muted">Every question was answered correctly without help.</p>
          </div>
        )}
        {proposals.map((p, i) => {
          const list = lists[i]!;
          const k = pick[i]!;
          const q = k >= 0 ? list[k] : undefined;
          return (
            <section key={p.questionId} className="card qc">
              <div className="ch">
                <span className="meta">
                  <span className="pill gray">Q{p.n}</span>
                  {p.label && <span>{p.label}</span>}
                  <span className="pill red">{p.reason}</span>
                </span>
              </div>
              <p className="muted clamp" style={{ margin: 0 }}>
                <Rich text={p.prompt} />
              </p>
              {q ? (
                <div className="pick" style={{ border: "1px solid var(--line)", borderRadius: 10 }}>
                  <li className={open === i ? "expanded" : undefined} style={{ listStyle: "none" }}>
                    <span className="n">→</span>
                    <button type="button" className="pickopen" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
                      <QuestionLine q={q} />
                    </button>
                    <span />
                    {open === i && <PreviewPanel id={q.id} />}
                  </li>
                </div>
              ) : (
                <p className="note">{list.length ? "Left out of the quiz." : "No other question on this concept yet. Generate one with AI."}</p>
              )}
              <div className="actions-row">
                {list.length > 1 && (
                  <button type="button" className="btn sm" onClick={() => setPick((ks) => ks.map((x, j) => (j === i ? (x + 1) % list.length : x)))}>
                    Swap ({(k >= 0 ? k : 0) + 1} of {list.length})
                  </button>
                )}
                <button type="button" className="btn sm" disabled={busy !== null} onClick={() => void generate(i)}>
                  {busy === i ? "Writing a question…" : "Generate with AI"}
                </button>
                {list.length > 0 && (
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => setPick((ks) => ks.map((x, j) => (j === i ? (x >= 0 ? -1 : 0) : x)))}
                  >
                    {k >= 0 ? "Leave out" : "Put back"}
                  </button>
                )}
                {notes[i] && <span className="formmsg bad">{notes[i]}</span>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
