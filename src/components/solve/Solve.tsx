"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { StudentQuestion, StudentResponse } from "@/lib/student";
import { saveDraft, submitAssignment, uploadPhoto } from "@/lib/student-actions";
import { ArrowLeft, ArrowRight, EyeIcon } from "../Icons";
import { Blocks, Rich } from "../Rich";
import { flushAll, registerSaver } from "./flush";
import { dropBackup, keepBackup, reportIfStale, useBackup } from "../stale";
import { HelperDrawer, type Msg } from "./HelperDrawer";
import { useActivity } from "./useActivity";

export type SolveProps = {
  assignment: { id: string; title: string; helper: "on" | "off"; deadline: number | null };
  position: number;
  total: number;
  answered: boolean[];
  q: StudentQuestion;
  r: StudentResponse;
};

const timeNow = () => new Date().toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" });

/** A link that saves the current answer before leaving, so the next page shows it as answered. */
function SaveLink({ href, className, children, ...rest }: { href: string; className?: string; children: ReactNode } & Omit<React.ComponentProps<typeof Link>, "href">) {
  const router = useRouter();
  return (
    <Link
      href={href}
      className={className}
      {...rest}
      onClick={async (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        await flushAll();
        router.push(href);
      }}
    >
      {children}
    </Link>
  );
}

export function Solve(props: SolveProps) {
  const { assignment, position, total, q } = props;
  const [r, setR] = useState(props.r);
  const [hints, setHints] = useState(props.r.openedHints);
  const [drawer, setDrawer] = useState(false);
  const [chat, setChat] = useState<Msg[]>(props.r.chat);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [answered, setAnswered] = useState(props.answered);
  const [stale, setStale] = useState(false);
  const { onPaste, pauseTracking } = useActivity(r.id, !r.submitted);
  const base = `/student/a/${assignment.id}`;
  const unanswered = answered.filter((x) => !x).length;
  const onAnswered = useCallback(
    (v: boolean) => setAnswered((cur) => (cur[position - 1] === v ? cur : cur.map((x, i) => (i === position - 1 ? v : x)))),
    [position],
  );

  useEffect(() => {
    const onStale = () => setStale(true);
    window.addEventListener("onside:stale", onStale);
    return () => window.removeEventListener("onside:stale", onStale);
  }, []);

  return (
    <>
      {stale && (
        <div className="stalebar" role="alert">
          <span>This page is out of date, so your last answers may not have been saved. Refresh to carry on.</span>
          <button type="button" className="btn sm" onClick={() => window.location.reload()}>
            Refresh
          </button>
        </div>
      )}
      <div className="subbar">
        <div className="wrap">
          <nav className="crumbs" aria-label="Breadcrumb">
            <SaveLink href="/student" style={{ color: "inherit" }}>Assignments</SaveLink>
            <span aria-hidden>/</span>
            <span className="cur">{assignment.title}</span>
          </nav>
          <div className="rowacts">
            {assignment.deadline && <TimeLeft deadline={assignment.deadline} assignmentId={assignment.id} />}
            <button type="button" className="btn primary sm" onClick={() => setConfirmSubmit(true)}>
              Submit assignment
            </button>
          </div>
        </div>
      </div>

      <main className="page">
        <div className="narrow">
          <div className="qtop">
            <span className="count">
              Question {position} of {total} · {total - unanswered} answered
            </span>
            <ol className="stepper" aria-label="Questions">
              {Array.from({ length: total }, (_, i) => (
                <li key={i}>
                  <SaveLink
                    href={`${base}/q/${i + 1}`}
                    className={[i + 1 === position ? "on" : "", answered[i] ? "done" : ""].join(" ").trim() || undefined}
                    aria-current={i + 1 === position ? "step" : undefined}
                    aria-label={`Question ${i + 1}${answered[i] ? ", answered" : ", no answer yet"}`}
                  >
                    {i + 1}
                  </SaveLink>
                </li>
              ))}
            </ol>
          </div>

          <article className="card qcard">
            {q.label && <span className="pill gray" style={{ alignSelf: "flex-start" }}>{q.label}</span>}
            {q.context.length > 0 && (
              // In the real paper the extract is in front of them. Open it whenever the question
              // sends them to it, and on the first question of a set to show it is there.
              <details className="sub" open={position === 1 || needsExtract(q.prompt, q.marks) || undefined}>
                <summary>Extracts and data</summary>
                <Blocks blocks={q.context} />
              </details>
            )}
            {q.lead.length > 0 && <Blocks blocks={q.lead} />}
            <p className="prompt">
              <Rich text={q.prompt} />
              <span className="marks"> [{q.marks}]</span>
            </p>

            {hints.map((h, i) => (
              <details key={i} className="hintnote" open>
                <summary>Hint {i + 1}</summary>
                <p>{h}</p>
              </details>
            ))}

            {q.mode === "auto" ? (
              <AutoAnswer q={q} r={r} onPaste={onPaste} onAnswered={onAnswered} />
            ) : (
              <WrittenAnswer q={q} r={r} setR={setR} onPaste={onPaste} pauseTracking={pauseTracking} onAnswered={onAnswered} />
            )}

            {assignment.helper === "on" && !r.submitted && (
              <div className="qfoot">
                <span>Stuck on a step?</span>
                <button type="button" className="link" onClick={() => setDrawer(true)}>
                  Open the Helper
                </button>
              </div>
            )}
          </article>

          <p className="dtrans" style={{ margin: "12px 0 0" }}>
            <EyeIcon /> Your tutor can see how you use the AI Helper, and when you paste text or leave this tab.
          </p>

          <div className="pager">
            {position > 1 ? (
              <SaveLink href={`${base}/q/${position - 1}`} className="btn ghost">
                <ArrowLeft /> Previous
              </SaveLink>
            ) : (
              <span />
            )}
            {position < total ? (
              <SaveLink href={`${base}/q/${position + 1}`} className="btn">
                Next <ArrowRight />
              </SaveLink>
            ) : (
              <button type="button" className="btn primary" onClick={() => setConfirmSubmit(true)}>
                Submit assignment
              </button>
            )}
          </div>
        </div>
      </main>

      {drawer && (
        <HelperDrawer
          responseId={r.id}
          unlockAt={r.unlockAt}
          hasHints={q.hasHints}
          hints={hints}
          onHint={(h) => setHints((cur) => [...cur, h])}
          onClose={() => setDrawer(false)}
          msgs={chat}
          setMsgs={setChat}
        />
      )}

      {confirmSubmit && (
        <SubmitDialog assignmentId={assignment.id} unanswered={unanswered} total={total} onCancel={() => setConfirmSubmit(false)} />
      )}
    </>
  );
}

function SubmitDialog({ assignmentId, unanswered, total, onCancel }: { assignmentId: string; unanswered: number; total: number; onCancel: () => void }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    setPending(true);
    setError(null);
    try {
      await flushAll();
      const res = await submitAssignment(assignmentId);
      if ("error" in res) {
        setError(res.error);
        setPending(false);
        return;
      }
      router.push(res.to);
    } catch (e) {
      console.error("submit failed", e);
      setError(
        reportIfStale(e)
          ? "This page is out of date. Refresh the page, then submit again."
          : "It didn't submit. Check your connection and try again.",
      );
      setPending(false);
    }
  }
  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-labelledby="submit-title" onKeyDown={(e) => e.key === "Escape" && !pending && onCancel()}>
      <div className="dialog">
        <h2 id="submit-title">Submit assignment?</h2>
        <p>
          {unanswered > 0
            ? `${unanswered} of ${total} ${unanswered === 1 ? "question has" : "questions have"} no answer. `
            : ""}
          You can&apos;t change your answers after this. Answers are checked when you submit.
        </p>
        {error && <p className="formmsg bad" role="alert">{error}</p>}
        <div className="acts">
          <button type="button" className="btn" onClick={onCancel} disabled={pending} autoFocus>
            Keep working
          </button>
          <button type="button" className="btn primary" onClick={submit} disabled={pending}>
            {pending ? "Submitting…" : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TimeLeft({ deadline, assignmentId }: { deadline: number; assignmentId: string }) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const sent = useRef(false);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const left = Math.max(0, deadline - now);
  useEffect(() => {
    if (left === 0 && !sent.current) {
      sent.current = true;
      void flushAll()
        .then(() => submitAssignment(assignmentId))
        .then((res) => router.push("to" in res ? res.to : `/student/a/${assignmentId}/done`))
        .catch(() => router.refresh());
    }
  }, [left, assignmentId, router]);
  const m = Math.floor(left / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  return (
    <span className="muted" style={{ fontSize: 14, fontVariantNumeric: "tabular-nums" }}>
      {left === 0 ? "Time is up" : `${m}:${String(s).padStart(2, "0")} left`}
    </span>
  );
}

/**
 * Saves `value` a moment after it changes, every 20 s with a snapshot for the tutor's replay,
 * when the tab is hidden, and before leaving the question.
 */
function useAutosave<T>(responseId: string, value: T, initial: T, toDraft: (v: T) => Parameters<typeof saveDraft>[1], enabled: boolean) {
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const latest = useRef(value);
  const initialKey = JSON.stringify(initial);
  const saved = useRef(initialKey);
  const snap = useRef(initialKey);
  const toDraftRef = useRef(toDraft);
  useEffect(() => {
    latest.current = value;
    toDraftRef.current = toDraft;
  });

  const save = useCallback(
    async (snapshot: boolean) => {
      const key = JSON.stringify(latest.current);
      if (key === saved.current && (!snapshot || key === snap.current)) return;
      saved.current = key;
      if (snapshot) snap.current = key;
      keepBackup(responseId, latest.current);
      try {
        const res = await saveDraft(responseId, toDraftRef.current(latest.current), snapshot);
        if ("ok" in res) {
          setSavedAt(timeNow());
          dropBackup(responseId);
        }
      } catch (e) {
        saved.current = ""; // try again on the next change
        if (!reportIfStale(e)) throw e;
      }
    },
    [responseId],
  );

  useEffect(() => {
    if (!enabled) return;
    const unregister = registerSaver(() => save(false));
    const t = window.setInterval(() => void save(true), 20_000);
    const onHide = () => document.visibilityState === "hidden" && void save(false);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      unregister();
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onHide);
      void save(false);
    };
  }, [enabled, save]);

  const key = JSON.stringify(value);
  useEffect(() => {
    if (!enabled) return;
    const t = window.setTimeout(() => void save(false), 800);
    return () => window.clearTimeout(t);
  }, [key, enabled, save]);

  return savedAt;
}

/** Offers back an answer this browser kept when a save didn't reach the server. */
function RestoreNote({ onRestore }: { onRestore: () => void }) {
  const [gone, setGone] = useState(false);
  if (gone) return null;
  return (
    <p className="formmsg bad" role="status">
      An answer on this computer was never saved.{" "}
      <button
        type="button"
        className="link"
        onClick={() => {
          onRestore();
          setGone(true);
        }}
      >
        Put it back
      </button>
    </p>
  );
}

function SavedNote({ savedAt, extra }: { savedAt: string | null; extra?: string }) {
  const text = [extra, savedAt ? `Saved ${savedAt}` : null].filter(Boolean).join(" · ");
  return text ? <span className="note">{text}</span> : null;
}

function SubmittedNote() {
  return <p className="note" style={{ margin: 0 }}>Submitted.</p>;
}

// ---------- auto-marked: MCQ, calculation, analysis chain (checked when the set is submitted) ----------

function AutoAnswer({
  q,
  r,
  onPaste,
  onAnswered,
}: {
  q: StudentQuestion;
  r: StudentResponse;
  onPaste: (field: string) => (e: React.ClipboardEvent) => void;
  onAnswered: (v: boolean) => void;
}) {
  const done = r.submitted;
  const initialAnswers = q.format === "mcq" ? (r.answers.length ? r.answers : r.attempts.at(-1) ? [r.attempts.at(-1)!.value] : []) : r.answers;
  const [choice, setChoice] = useState(q.format === "mcq" ? (initialAnswers[0] ?? "") : "");
  const [answers, setAnswers] = useState<string[]>(() => q.parts?.map((_, i) => r.answers[i] ?? "") ?? []);
  const [working, setWorking] = useState(r.working);
  const [chosenChain, setChosenChain] = useState(r.answers.length > 0);
  const [chain, setChain] = useState<string[]>(() => (r.answers.length ? r.answers : (q.steps ?? []).map((s) => s.id)));

  const value =
    q.format === "mcq"
      ? { answers: choice ? [choice] : [] }
      : q.format === "calculation"
        ? { working, answers }
        : { answers: chosenChain ? chain : [] };
  const initial =
    q.format === "mcq"
      ? { answers: initialAnswers.slice(0, 1) }
      : q.format === "calculation"
        ? { working: r.working, answers: q.parts?.map((_, i) => r.answers[i] ?? "") ?? [] }
        : { answers: r.answers };
  const savedAt = useAutosave(r.id, value, initial, (v) => v, !done);

  // An answer this browser kept because the server never got it (e.g. the site was updated mid-question).
  const backup = useBackup<{ answers?: string[]; working?: string }>(r.id);
  const restore = () => {
    if (!backup) return;
    if (q.format === "mcq" && backup.answers?.[0]) setChoice(backup.answers[0]);
    if (q.format === "calculation") {
      if (backup.answers?.length) setAnswers((cur) => cur.map((x, i) => backup.answers![i] ?? x));
      if (backup.working) setWorking(backup.working);
    }
    if (q.format === "analysis_chain" && backup.answers?.length) {
      setChain(backup.answers);
      setChosenChain(true);
    }
    onAnswered(true);
  };

  const calcHas = (w: string, a: string[]) => Boolean(w.trim()) || a.some((x) => x.trim());

  return (
    <>
      {!done && backup && <RestoreNote onRestore={restore} />}
      {q.format === "mcq" && (
        <div className="choices" role="radiogroup" aria-label="Options">
          {q.options!.map((o) => (
            <label key={o.id} className={`choice${choice === o.id ? " on" : ""}`}>
              <input
                type="radio"
                name="mcq"
                value={o.id}
                checked={choice === o.id}
                disabled={done}
                onChange={() => {
                  setChoice(o.id);
                  onAnswered(true);
                }}
              />
              <span className="k">{o.id.toUpperCase()}</span>
              <span>{o.text}</span>
            </label>
          ))}
        </div>
      )}

      {q.format === "calculation" && (
        <>
          <div className="field">
            <label htmlFor="working">
              Your working <span className="muted" style={{ fontWeight: 400 }}>(your tutor marks this)</span>
            </label>
            <textarea
              id="working"
              className="working"
              placeholder="Write your steps here"
              value={working}
              disabled={done}
              onChange={(e) => {
                setWorking(e.target.value);
                onAnswered(calcHas(e.target.value, answers));
              }}
              onPaste={onPaste("working")}
            />
          </div>
          {q.parts!.map((p, i) => (
            <div className="field" key={i}>
              <label htmlFor={`ans${i}`}>Final answer {p.label}</label>
              <div className="ansrow">
                <input
                  id={`ans${i}`}
                  className="answer"
                  inputMode="decimal"
                  value={answers[i] ?? ""}
                  disabled={done}
                  placeholder={p.unit}
                  onChange={(e) => {
                    const next = answers.map((x, j) => (j === i ? e.target.value : x));
                    setAnswers(next);
                    onAnswered(calcHas(working, next));
                  }}
                  onPaste={onPaste(`answer${i}`)}
                />
              </div>
            </div>
          ))}
        </>
      )}

      {q.format === "analysis_chain" && (
        <>
          <ChainEditor
            steps={q.steps!}
            chain={chain}
            setChain={(c) => {
              setChain(c);
              setChosenChain(true);
              onAnswered(true);
            }}
            disabled={done}
          />
          {!done && !chosenChain && (
            <div>
              <button
                type="button"
                className="btn sm"
                onClick={() => {
                  setChosenChain(true);
                  onAnswered(true);
                }}
              >
                Keep this order
              </button>
              <p className="note" style={{ marginTop: 8 }}>Move or take out steps, or keep this order, to record your answer.</p>
            </div>
          )}
        </>
      )}

      {done ? <SubmittedNote /> : <SavedNote savedAt={savedAt} />}
    </>
  );
}

function ChainEditor({
  steps,
  chain,
  setChain,
  disabled,
}: {
  steps: { id: string; text: string }[];
  chain: string[];
  setChain: (c: string[]) => void;
  disabled: boolean;
}) {
  const text = new Map(steps.map((s) => [s.id, s.text]));
  const left = steps.filter((s) => !chain.includes(s.id));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= chain.length) return;
    const next = [...chain];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setChain(next);
  };
  return (
    <div className="field">
      <label>Put the steps in order. Take out any step that does not belong.</label>
      <ol className="chainlist">
        {chain.map((id, i) => (
          <li key={id}>
            <span className="n">{i + 1}</span>
            <span>{text.get(id)}</span>
            <span className="rowacts">
              <button type="button" className="btn ghost sm" disabled={disabled || i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
              <button type="button" className="btn ghost sm" disabled={disabled || i === chain.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
              <button type="button" className="btn ghost sm" disabled={disabled} onClick={() => setChain(chain.filter((x) => x !== id))}>
                Take out
              </button>
            </span>
          </li>
        ))}
      </ol>
      {left.length > 0 && (
        <>
          <label>Taken out</label>
          <ul className="chainlist out">
            {left.map((s) => (
              <li key={s.id}>
                <span className="n">–</span>
                <span>{s.text}</span>
                <span className="rowacts">
                  <button type="button" className="btn ghost sm" disabled={disabled} onClick={() => setChain([...chain, s.id])}>
                    Put back
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// ---------- written: short answer, diagram, essay, past-paper items ----------

function WrittenAnswer({
  q,
  r,
  setR,
  onPaste,
  pauseTracking,
  onAnswered,
}: {
  q: StudentQuestion;
  r: StudentResponse;
  setR: (r: StudentResponse) => void;
  onPaste: (field: string) => (e: React.ClipboardEvent) => void;
  pauseTracking: () => void;
  onAnswered: (v: boolean) => void;
}) {
  const isEssay = q.format === "essay";
  const isCalc = q.format === "calculation";
  const isDiagram = q.format === "diagram" || Boolean(q.label && /\b(diagram|sketch|draw)\b/i.test(q.prompt));
  const prompts = q.planPrompts ?? [];
  const [plan, setPlan] = useState<string[]>(() => {
    const saved = safeParse(r.plan);
    return prompts.map((_, i) => saved[i] ?? "");
  });
  const [stage, setStage] = useState<"plan" | "write">(isEssay && !r.finalText && !r.submitted ? "plan" : "write");
  const [working, setWorking] = useState(r.working);
  const [text, setText] = useState(r.finalText);
  const [error, setError] = useState<string | null>(null);
  const [photoVersion, setPhotoVersion] = useState(0);
  const [uploading, setUploading] = useState(false);
  const done = r.submitted;

  const planJson = (p: string[]) => (prompts.length && p.some((x) => x.trim()) ? JSON.stringify(p) : "");
  const savedAt = useAutosave(
    r.id,
    { working, text, plan },
    { working: r.working, text: r.finalText, plan: prompts.map((_, i) => safeParse(r.plan)[i] ?? "") },
    (v) => ({ working: v.working, finalText: v.text, plan: prompts.length ? planJson(v.plan) : undefined }),
    !done,
  );
  const report = (next: { working?: string; text?: string; plan?: string[]; photo?: boolean }) => {
    const w = next.working ?? working;
    const t = next.text ?? text;
    const p = next.plan ?? plan;
    onAnswered(Boolean(w.trim() || t.trim() || p.some((x) => x.trim()) || (next.photo ?? r.photo)));
  };

  const backup = useBackup<{ working?: string; text?: string; plan?: string[] }>(r.id);
  const restore = () => {
    if (!backup) return;
    if (backup.working) setWorking(backup.working);
    if (backup.text) {
      setText(backup.text);
      setStage("write");
    }
    if (backup.plan?.length) setPlan((cur) => cur.map((x, i) => backup.plan![i] ?? x));
    onAnswered(true);
  };

  async function upload(original: File) {
    setError(null);
    if (original.size > 25 * 1024 * 1024) return setError("The photo must be under 25 MB.");
    setUploading(true);
    try {
      const file = await shrinkPhoto(original);
      const fd = new FormData();
      fd.set("responseId", r.id);
      fd.set("photo", file);
      const res = await uploadPhoto(fd);
      if ("error" in res) return setError(res.error);
      setR({ ...r, photo: true });
      setPhotoVersion((v) => v + 1);
      report({ photo: true });
    } catch {
      setError("The photo didn't upload. Check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  if (isEssay && stage === "plan") {
    return (
      <>
        <p className="muted" style={{ margin: 0 }}>Plan first. Short notes are enough.</p>
        {prompts.map((p, i) => (
          <div className="field" key={i}>
            <label htmlFor={`plan${i}`}>{p}</label>
            <textarea
              id={`plan${i}`}
              className="working"
              style={{ minHeight: 72 }}
              value={plan[i]}
              onChange={(e) => {
                const next = plan.map((x, j) => (j === i ? e.target.value : x));
                setPlan(next);
                report({ plan: next });
              }}
              onPaste={onPaste("plan")}
            />
          </div>
        ))}
        <div>
          <button type="button" className="btn primary lg" disabled={plan.every((x) => !x.trim())} onClick={() => setStage("write")}>
            Start writing
          </button>
        </div>
        <SavedNote savedAt={savedAt} />
      </>
    );
  }

  return (
    <>
      {!done && backup && <RestoreNote onRestore={restore} />}
      {isEssay && (
        <details className="sub">
          <summary>Your plan</summary>
          <div className="blocks">
            {prompts.map((p, i) => (
              <p key={i}>
                <b>{p}:</b> {plan[i] || "—"}
              </p>
            ))}
          </div>
        </details>
      )}

      {isDiagram && (
        <div className="field">
          <label htmlFor="photo">Photo of your diagram</label>
          {r.photo && (
            // eslint-disable-next-line @next/next/no-img-element -- private upload served by an auth-checked route
            <img className="upload" src={`/api/photo?r=${r.id}&v=${photoVersion}`} alt="Your uploaded diagram" />
          )}
          {!done && (
            <input
              id="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={uploading}
              onClick={pauseTracking}
              onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])}
            />
          )}
          <span className="note">{uploading ? "Uploading…" : "Label the axes and every curve."}</span>
        </div>
      )}

      {isCalc && (
        <div className="field">
          <label htmlFor="working">Your working</label>
          <textarea
            id="working"
            className="working"
            placeholder="Write your steps here"
            value={working}
            disabled={done}
            onChange={(e) => {
              setWorking(e.target.value);
              report({ working: e.target.value });
            }}
            onPaste={onPaste("working")}
          />
        </div>
      )}

      <div className="field">
        <label htmlFor="answer">{isCalc ? "Final answer" : isDiagram ? "Explanation" : "Your answer"}</label>
        <textarea
          id="answer"
          className="working"
          style={{ minHeight: isEssay ? 360 : isCalc ? 60 : 180 }}
          value={text}
          disabled={done}
          onChange={(e) => {
            setText(e.target.value);
            report({ text: e.target.value });
          }}
          onPaste={onPaste("answer")}
        />
        {done ? (
          <SubmittedNote />
        ) : (
          <SavedNote savedAt={savedAt} extra={`${text.trim().split(/\s+/).filter(Boolean).length} words`} />
        )}
      </div>

      {error && <p className="formmsg bad" role="alert">{error}</p>}
    </>
  );
}

/** Resizes a photo to at most 2000 px on the long side as JPEG, so it uploads quickly and stays under the server limit. */
async function shrinkPhoto(file: File): Promise<File> {
  if (file.size < 1.5 * 1024 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    return blob ? new File([blob], "diagram.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

function safeParse(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return s ? [s] : [];
  }
}

/** Whether the question sends the student to the extract: it names it, or it is a long answer. */
function needsExtract(prompt: string, marks: number): boolean {
  return marks >= 10 || /\b(text|table|figure|paragraph|extract|data)\b/i.test(prompt);
}
