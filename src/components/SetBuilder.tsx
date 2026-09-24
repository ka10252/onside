"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { BankQuestion } from "@/lib/admin";
import { saveSet } from "@/lib/admin-actions";
import { EMPTY_FILTER, matches, pickRandom, sameQuestionKey, SESSIONS, SKILLS, sourceOf, type BankFilter, type Source } from "@/lib/bank-filter";
import { generateQuestions, loadBankRange, studentHistory, type SeenState } from "@/lib/builder-actions";
import { PreviewPanel, QuestionLine } from "./QuestionPreview";

type Initial = { id: string; title: string; helper: "on" | "off"; timeLimitMin: number | null; questionIds: string[] };
type Part = { id: string; name: string; units: { number: number; title: string }[] };
type Mode = "all" | "past" | "mix" | "ai";
type AiFormat = "mcq" | "short_answer" | "calculation" | "essay";

const FORMATS: { key: string; label: string }[] = [
  { key: "mcq", label: "MCQ" },
  { key: "calculation", label: "Calculation" },
  { key: "short_answer", label: "Short answer" },
  { key: "diagram", label: "Diagram" },
  { key: "essay", label: "Essay" },
  { key: "analysis_chain", label: "Analysis chain" },
];

export type BuilderStart = { studentId?: string; units?: number[]; sources?: Source[]; count?: number; mode?: Mode };

/** How many approved questions each unit holds, one row per source. */
export type BankCount = { unit_number: number; source: string; paper_style: string | null; n: number };

const SOURCES: { key: Source; label: string }[] = [
  { key: "test", label: "Unit test questions" },
  { key: "P1", label: "Paper 1" },
  { key: "P2", label: "Paper 2" },
  { key: "P3", label: "Paper 3" },
  { key: "onside", label: "Unit 16 pack (tutor-made)" },
  { key: "ai", label: "AI-made (approved)" },
];
const PAST: Source[] = ["P1", "P2", "P3"];
/** Stands for "every unit is loaded" in the list of loaded units. */
const ALL = 0;
const AI_FORMATS: { key: AiFormat; label: string }[] = [
  { key: "short_answer", label: "Short answer" },
  { key: "calculation", label: "Calculation" },
  { key: "mcq", label: "MCQ" },
  { key: "essay", label: "Essay" },
];

export function SetBuilder({
  questions,
  counts,
  parts,
  initial,
  students = [],
  start,
}: {
  /** Only the questions already in the set; the rest arrive unit by unit. */
  questions: BankQuestion[];
  counts: BankCount[];
  parts: Part[];
  initial?: Initial;
  students?: { id: string; name: string }[];
  start?: BuilderStart;
}) {
  const [bank, setBank] = useState(questions);
  // Which units' questions are in `bank`. The whole bank is 600 KB, so it is fetched a unit at a time.
  const [loadedUnits, setLoadedUnits] = useState<number[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const byId = useMemo(() => new Map(bank.map((q) => [q.id, q])), [bank]);
  const unitTitle = useMemo(() => new Map(parts.flatMap((p) => p.units.map((u) => [u.number, u.title] as const))), [parts]);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [titleTouched, setTitleTouched] = useState(Boolean(initial));
  const [helper, setHelper] = useState<"on" | "off">(initial?.helper ?? "on");
  const [timeLimit, setTimeLimit] = useState(initial?.timeLimitMin ? String(initial.timeLimitMin) : "");
  const [selected, setSelected] = useState<string[]>(initial?.questionIds.filter((id) => byId.has(id)) ?? []);
  const [filter, setFilter] = useState<BankFilter>({
    ...EMPTY_FILTER,
    units: start?.units ?? [],
    sources: start?.sources ?? [],
  });
  const [studentId, setStudentId] = useState(start?.studentId ?? "");
  const [due, setDue] = useState("");
  const [hideSeen, setHideSeen] = useState(true);
  const [history, setHistory] = useState<Record<string, SeenState>>({});
  const [mode, setMode] = useState<Mode>(start?.mode ?? "all");
  const [count, setCount] = useState(String(start?.count ?? 5));
  const [aiCount, setAiCount] = useState("3");
  const [aiFormats, setAiFormats] = useState<AiFormat[]>(["short_answer", "calculation"]);
  const [spread, setSpread] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const chosen = selected.map((id) => byId.get(id)!).filter(Boolean);
  const marks = chosen.reduce((n, q) => n + q.marks, 0);
  const drafts = chosen.filter((q) => q.source === "ai").length;

  // Title follows the units in the set until the tutor types their own.
  const autoTitle = useMemo(() => {
    const units = [...new Set(chosen.map((q) => q.unit_number))].sort((a, b) => a - b);
    if (!units.length) return "";
    const names = units.map((u) => unitTitle.get(u) ?? `Unit ${u}`);
    const full = names.join(" · ");
    if (full.length <= 100) return full;
    const short = `Units ${units.join(", ")}`;
    const withFirst = `${short} · ${names[0]}`;
    return withFirst.length <= 100 ? withFirst : short.slice(0, 100);
  }, [chosen, unitTitle]);
  const shownTitle = titleTouched ? title : autoTitle;

  const effective = useMemo<BankFilter>(
    () =>
      mode === "all"
        ? filter
        : mode === "ai"
          ? { ...filter, sources: ["ai"] }
          : { ...filter, sources: filter.sources.length ? filter.sources.filter((s) => PAST.includes(s)) : PAST },
    [mode, filter],
  );
  // Counted on the server, so the numbers are right for units whose questions aren't loaded yet.
  const unitCounts = useMemo(() => {
    const m = new Map<number, number>();
    for (const c of counts) {
      if (effective.sources.length && !effective.sources.includes(sourceOf(c))) continue;
      m.set(c.unit_number, (m.get(c.unit_number) ?? 0) + c.n);
    }
    return m;
  }, [counts, effective.sources]);
  const bankTotal = useMemo(() => counts.reduce((n, c) => n + c.n, 0), [counts]);
  // What the chosen student already had (same question in another time zone counts too).
  const seenKeys = useMemo(() => {
    const m = new Map<string, SeenState>();
    for (const [id, st] of Object.entries(history)) {
      const q = byId.get(id);
      if (q) m.set(sameQuestionKey(q), st);
    }
    return m;
  }, [history, byId]);
  const seenOf = useCallback((q: BankQuestion) => history[q.id] ?? seenKeys.get(sameQuestionKey(q)), [history, seenKeys]);
  const visible = useMemo(
    () => bank.filter((q) => matches(q, effective) && !(studentId && hideSeen && seenOf(q))),
    [bank, effective, studentId, hideSeen, seenOf],
  );
  const shown = visible.slice(0, 150);
  const everyUnit = loadedUnits.includes(ALL);
  const poolReady = filter.units.length ? filter.units.every((u) => loadedUnits.includes(u)) : everyUnit;

  const set = <K extends keyof BankFilter>(k: K, v: BankFilter[K]) => setFilter((f) => ({ ...f, [k]: v }));
  const toggleIn = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const move = (i: number, d: -1 | 1) =>
    setSelected((s) => {
      const j = i + d;
      if (j < 0 || j >= s.length) return s;
      const next = [...s];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  // The bank arrives a unit at a time. These refs hold what is loaded right now, so a click can
  // wait for the units it needs without reading stale state.
  const bankRef = useRef(bank);
  const loadedRef = useRef<number[]>([]);
  useEffect(() => {
    bankRef.current = bank;
  }, [bank]);

  /** Fetches the questions of these units (none = the whole bank) and returns the bank with them in. */
  const ensureLoaded = useCallback(async (units: number[]): Promise<BankQuestion[]> => {
    if (loadedRef.current.includes(ALL)) return bankRef.current;
    const whole = units.length === 0;
    const missing = whole ? [ALL] : units.filter((u) => !loadedRef.current.includes(u));
    if (!missing.length) return bankRef.current;
    const before = loadedRef.current;
    loadedRef.current = [...before, ...missing];
    setLoadedUnits(loadedRef.current);
    setLoadingUnits(true);
    try {
      const rows = await loadBankRange(whole ? [] : missing);
      const have = new Set(bankRef.current.map((q) => q.id));
      const merged = [...bankRef.current, ...rows.filter((q) => !have.has(q.id))];
      bankRef.current = merged;
      setBank(merged);
      return merged;
    } catch {
      loadedRef.current = before;
      setLoadedUnits(before);
      return bankRef.current;
    } finally {
      setLoadingUnits(false);
    }
  }, []);

  // Ticking a unit loads it. Nothing ticked means the whole bank, which only happens on request.
  useEffect(() => {
    if (filter.units.length) void ensureLoaded(filter.units);
  }, [filter.units, ensureLoaded]);

  // Prefilled links (?student=…&count=10) pick new questions once the student's history is in.
  const autofill = useRef(Boolean(start?.count && start?.studentId));
  const latest = useRef({ effective, count, spread });
  useEffect(() => {
    latest.current = { effective, count, spread };
  }, [effective, count, spread]);
  useEffect(() => {
    let live = true;
    if (!studentId) return;
    void studentHistory(studentId).then(async (h) => {
      if (!live) return;
      setHistory(h);
      if (!autofill.current) return;
      autofill.current = false;
      const { effective: f, count: c, spread: sp } = latest.current;
      const b = await ensureLoaded(f.units);
      if (!live) return;
      const byIdNow = new Map(b.map((q) => [q.id, q]));
      const seen = new Set(Object.keys(h).flatMap((id) => (byIdNow.get(id) ? [sameQuestionKey(byIdNow.get(id)!)] : [])));
      const pool = b.filter((q) => matches(q, f) && !h[q.id] && !seen.has(sameQuestionKey(q)));
      const n = Math.max(1, Math.min(40, Number(c) || 0));
      const picked = pickRandom(pool, n, [], sp && f.units.length !== 1);
      setSelected(picked.map((q) => q.id));
      setNote(`Added ${picked.length} questions this student hasn't had.`);
    });
    return () => {
      live = false;
    };
  }, [studentId, ensureLoaded]);

  async function addRandom() {
    const n = Math.max(1, Math.min(40, Number(count) || 0));
    const b = await ensureLoaded(filter.units);
    const pool = b.filter((q) => matches(q, effective) && !(studentId && hideSeen && seenOf(q)));
    const picked = pickRandom(pool, n, chosen, spread && filter.units.length !== 1);
    setSelected((s) => [...s, ...picked.map((q) => q.id)]);
    setNote(
      picked.length === n
        ? `Added ${picked.length} ${picked.length === 1 ? "question" : "questions"}.`
        : `Only ${picked.length} more ${picked.length === 1 ? "question matches" : "questions match"} these options.`,
    );
  }

  async function generate() {
    setAiNote(null);
    const units = filter.units.length ? filter.units : [...new Set(chosen.map((q) => q.unit_number))];
    if (!units.length) return setAiNote("Choose units first.");
    setGenerating(true);
    try {
      const res = await generateQuestions(units, Number(aiCount) || 1, aiFormats);
      if ("error" in res) return setAiNote(res.error);
      setBank((b) => [...b, ...res.questions.filter((q) => !b.some((x) => x.id === q.id))]);
      setSelected((s) => [...s, ...res.questions.map((q) => q.id)]);
      setAiNote(`Added ${res.questions.length} AI ${res.questions.length === 1 ? "question" : "questions"}. Open each one to check it.`);
    } finally {
      setGenerating(false);
    }
  }

  function save() {
    setError(null);
    const minutes = helper === "off" && timeLimit.trim() ? Number(timeLimit) : null;
    startTransition(async () => {
      const res = await saveSet(initial?.id ?? null, {
        title: shownTitle,
        helper,
        timeLimitMin: minutes,
        questionIds: selected,
        sendTo: studentId && !initial ? { studentId, due: due || null } : null,
      });
      if (res?.error) setError(res.error);
    });
  }

  const unitLabel = filter.units.length === 0 ? "All units" : filter.units.length === 1 ? `Unit ${filter.units[0]}` : `${filter.units.length} units`;
  const shownSources = mode === "all" ? SOURCES : mode === "ai" ? [] : SOURCES.filter((s) => PAST.includes(s.key));
  const sourceLabel =
    mode === "ai"
      ? "AI-made questions"
      : effective.sources.length === 0
        ? "All sources"
        : shownSources.filter((s) => effective.sources.includes(s.key)).map((s) => s.label).join(", ");
  const formatLabel =
    filter.formats.length === 0
      ? "All formats"
      : FORMATS.filter((f) => filter.formats.includes(f.key)).map((f) => f.label).join(", ");
  const skillLabel = filter.skills.length === 0 ? "All question types" : filter.skills.length === 1 ? cap(filter.skills[0]!) : `${filter.skills.length} question types`;

  return (
    <div className="t3grid">
      <aside className="card settings">
        <div className="field">
          <label htmlFor="title">
            Title <span className="muted" style={{ fontWeight: 400 }}>{titleTouched ? "" : "(from the units)"}</span>
          </label>
          <input
            id="title"
            className="answer"
            value={shownTitle}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleTouched(e.target.value.trim() !== "");
            }}
            placeholder="Pick questions to name the set"
            maxLength={100}
          />
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

        {helper === "off" && (
          <div className="field">
            <label htmlFor="limit">
              Time limit <span className="muted" style={{ fontWeight: 400 }}>(minutes, optional)</span>
            </label>
            <input
              id="limit"
              className="answer"
              inputMode="numeric"
              value={timeLimit}
              onChange={(e) => setTimeLimit(e.target.value.replace(/\D/g, ""))}
              placeholder="45"
              style={{ maxWidth: 120 }}
            />
          </div>
        )}

        {!initial && students.length > 0 && (
          <div className="field">
            <label htmlFor="student">
              For student <span className="muted" style={{ fontWeight: 400 }}>(optional)</span>
            </label>
            <select
              id="student"
              className="answer"
              value={studentId}
              onChange={(e) => {
                setStudentId(e.target.value);
                if (!e.target.value) setHistory({});
              }}
            >
              <option value="">Anyone (send later)</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {studentId && (
              <>
                <label className="opt">
                  <input type="checkbox" checked={hideSeen} onChange={(e) => setHideSeen(e.target.checked)} />
                  <span>Hide questions they already had</span>
                </label>
                <label htmlFor="due" style={{ marginTop: 6 }}>
                  Due <span className="muted" style={{ fontWeight: 400 }}>(optional)</span>
                </label>
                <input id="due" type="date" className="answer" value={due} onChange={(e) => setDue(e.target.value)} />
              </>
            )}
          </div>
        )}

        <p className="meta" style={{ margin: 0 }}>
          <span>
            <b style={{ color: "var(--ink)" }}>{chosen.length}</b> questions
          </span>
          <span>
            <b style={{ color: "var(--ink)" }}>{marks}</b> marks
          </span>
          <span>{new Set(chosen.map((q) => q.unit_number)).size} units</span>
        </p>
        {studentId && chosen.some((q) => seenOf(q)) && (
          <p className="formmsg bad">{chosen.filter((q) => seenOf(q)).length} of these were already sent to this student.</p>
        )}
        {drafts > 0 && <p className="note">Saving approves the {drafts} AI {drafts === 1 ? "question" : "questions"} in this set.</p>}

        {error && <p className="formmsg bad" role="alert">{error}</p>}

        <button type="button" className="btn accent lg" onClick={save} disabled={pending}>
          {pending
            ? "Saving…"
            : initial
              ? "Save changes"
              : studentId
                ? `Save and send to ${students.find((x) => x.id === studentId)?.name.split(" ")[0] ?? "student"}`
                : "Save set"}
        </button>
      </aside>

      <div className="stack">
        <section className="card">
          <div className="card-hd">
            <h2>In this set</h2>
            {chosen.length > 0 && (
              <button type="button" className="btn ghost sm" onClick={() => setSelected([])}>
                Clear
              </button>
            )}
          </div>
          {chosen.length === 0 ? (
            <p className="cardbody muted" style={{ margin: 0 }}>Pick questions below, or add a random mix.</p>
          ) : (
            <ol className="pick">
              {chosen.map((q, i) => (
                <li key={q.id} className={open === q.id ? "expanded" : undefined}>
                  <span className="n">{i + 1}</span>
                  <button type="button" className="pickopen" aria-expanded={open === q.id} onClick={() => setOpen(open === q.id ? null : q.id)}>
                    <QuestionLine q={q} seen={studentId ? seenOf(q) : undefined} />
                  </button>
                  <span className="rowacts">
                    <button type="button" className="btn ghost sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                    <button type="button" className="btn ghost sm" onClick={() => move(i, 1)} disabled={i === chosen.length - 1} aria-label="Move down">↓</button>
                    <button type="button" className="btn ghost sm" onClick={() => toggle(q.id)}>Remove</button>
                  </span>
                  {open === q.id && <PreviewPanel id={q.id} />}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="card">
          <div className="card-hd">
            <h2>Question bank</h2>
            <span className="muted" style={{ fontSize: 14 }}>
              {loadingUnits ? "Loading…" : poolReady ? `${visible.length} match` : `${bankTotal} questions`}
            </span>
          </div>

          <div className="cardbody modes">
            <span className="lbl">Questions from</span>
            <div className="seg">
              {(
                [
                  ["all", "All sources"],
                  ["past", "Past papers only"],
                  ["mix", "Past papers + new AI questions"],
                  ["ai", "New AI questions only"],
                ] as const
              ).map(([k, label]) => (
                <label key={k}>
                  <input type="radio" name="mode" checked={mode === k} onChange={() => setMode(k)} />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="cardbody filtergrid">
            <details className="multi">
              <summary className="answer">{unitLabel}</summary>
              <div className="multibody">
                <button type="button" className="link" onClick={() => set("units", [])}>All units</button>
                {parts.map((p) => {
                  const nums = p.units.map((u) => u.number);
                  const all = nums.every((n) => filter.units.includes(n));
                  return (
                    <fieldset key={p.id}>
                      <legend>
                        <label className="opt">
                          <input
                            type="checkbox"
                            checked={all}
                            onChange={() =>
                              set("units", all ? filter.units.filter((n) => !nums.includes(n)) : [...new Set([...filter.units, ...nums])])
                            }
                          />
                          <b>{p.name}</b>
                        </label>
                      </legend>
                      {p.units.map((u) => (
                        <label key={u.number} className="opt">
                          <input type="checkbox" checked={filter.units.includes(u.number)} onChange={() => set("units", toggleIn(filter.units, u.number))} />
                          <span>
                            {u.number} · {u.title}
                          </span>
                          <span className="muted">{unitCounts.get(u.number) ?? 0}</span>
                        </label>
                      ))}
                    </fieldset>
                  );
                })}
              </div>
            </details>

            <details className="multi">
              <summary className="answer">{sourceLabel}</summary>
              <div className="multibody">
                {shownSources.map((s) => (
                  <label key={s.key} className="opt">
                    <input type="checkbox" checked={filter.sources.includes(s.key)} onChange={() => set("sources", toggleIn(filter.sources, s.key))} />
                    <span>{s.label}</span>
                  </label>
                ))}
              </div>
            </details>

            <details className="multi">
              <summary className="answer">{formatLabel}</summary>
              <div className="multibody">
                {FORMATS.map((f) => (
                  <label key={f.key} className="opt">
                    <input type="checkbox" checked={filter.formats.includes(f.key)} onChange={() => set("formats", toggleIn(filter.formats, f.key))} />
                    <span>{f.label}</span>
                  </label>
                ))}
              </div>
            </details>

            <details className="multi">
              <summary className="answer">{skillLabel}</summary>
              <div className="multibody">
                {SKILLS.map((s) => (
                  <label key={s} className="opt">
                    <input type="checkbox" checked={filter.skills.includes(s)} onChange={() => set("skills", toggleIn(filter.skills, s))} />
                    <span>{cap(s)}</span>
                  </label>
                ))}
              </div>
            </details>

            <select className="answer" value={filter.level} onChange={(e) => set("level", e.target.value as BankFilter["level"])} aria-label="Level">
              <option value="any">HL and SL papers</option>
              <option value="HL">HL papers</option>
              <option value="SL">SL papers</option>
            </select>

            <div className="range">
              <select
                className="answer"
                value={filter.from ?? ""}
                onChange={(e) => set("from", e.target.value ? Number(e.target.value) : null)}
                aria-label="Papers from (yymm)"
              >
                <option value="">From 2205</option>
                {SESSIONS.map((s) => (
                  <option key={s.yymm} value={s.yymm} disabled={filter.to !== null && s.yymm > filter.to}>
                    From {s.label}
                  </option>
                ))}
              </select>
              <span aria-hidden>~</span>
              <select
                className="answer"
                value={filter.to ?? ""}
                onChange={(e) => set("to", e.target.value ? Number(e.target.value) : null)}
                aria-label="Papers to (yymm)"
              >
                <option value="">To 2511</option>
                {SESSIONS.map((s) => (
                  <option key={s.yymm} value={s.yymm} disabled={filter.from !== null && s.yymm < filter.from}>
                    To {s.label}
                  </option>
                ))}
              </select>
            </div>

            <input
              className="answer"
              type="search"
              placeholder="Search"
              value={filter.search}
              onChange={(e) => set("search", e.target.value)}
              aria-label="Search questions"
            />
          </div>

          <div className="randomrow">
            <span>Add</span>
            <input
              className="answer"
              inputMode="numeric"
              aria-label="Number of questions"
              value={count}
              onChange={(e) => setCount(e.target.value.replace(/\D/g, "").slice(0, 2))}
            />
            <span>
              random {mode === "past" || mode === "mix" ? "past-paper " : mode === "ai" ? "saved AI " : ""}questions from these
              {studentId && hideSeen ? " (only new to this student)" : ""}
            </span>
            <label className="opt">
              <input type="checkbox" checked={spread} onChange={(e) => setSpread(e.target.checked)} />
              <span>Spread across units</span>
            </label>
            <button
              id="add-random"
              type="button"
              className="btn sm"
              onClick={() => void addRandom()}
              disabled={loadingUnits || (poolReady && visible.length === 0)}
            >
              {loadingUnits ? "Loading…" : "Add"}
            </button>
            {note && <span className="muted" role="status">{note}</span>}
          </div>

          {(mode === "mix" || mode === "ai") && (
            <div className="randomrow">
              <span>Generate</span>
              <input
                className="answer"
                inputMode="numeric"
                aria-label="Number of AI questions"
                value={aiCount}
                onChange={(e) => setAiCount(e.target.value.replace(/\D/g, "").slice(0, 2))}
              />
              <span>new AI questions for {filter.units.length ? unitLabel.toLowerCase() : "the units in the set"}:</span>
              {AI_FORMATS.map((f) => (
                <label key={f.key} className="opt">
                  <input type="checkbox" checked={aiFormats.includes(f.key)} onChange={() => setAiFormats((x) => toggleIn(x, f.key))} />
                  <span>{f.label}</span>
                </label>
              ))}
              <button type="button" className="btn sm" onClick={() => void generate()} disabled={generating}>
                {generating ? "Writing questions…" : "Generate"}
              </button>
              {aiNote && <span className="muted" role="status">{aiNote}</span>}
            </div>
          )}

          {!poolReady ? (
            <div className="cardbody stack" style={{ gap: 10, alignItems: "flex-start" }}>
              <p className="muted" style={{ margin: 0 }}>
                {loadingUnits
                  ? "Loading the questions…"
                  : "Tick one or more units above to see their questions. Only what you tick is loaded, which keeps this page quick."}
              </p>
              {!loadingUnits && (
                <button type="button" className="btn sm" onClick={() => void ensureLoaded([])}>
                  Show every unit ({bankTotal} questions)
                </button>
              )}
            </div>
          ) : visible.length === 0 ? (
            <p className="cardbody muted" style={{ margin: 0 }}>
              {mode === "ai" ? "No AI questions yet. Choose units and generate some." : "No questions match."}
            </p>
          ) : (
            <ul className="pick">
              {shown.map((q) => {
                const added = selected.includes(q.id);
                return (
                  <li key={q.id} className={open === `bank:${q.id}` ? "expanded" : undefined}>
                    <span className="n">{q.unit_number}</span>
                    <button
                      type="button"
                      className="pickopen"
                      aria-expanded={open === `bank:${q.id}`}
                      onClick={() => setOpen(open === `bank:${q.id}` ? null : `bank:${q.id}`)}
                    >
                      <QuestionLine q={q} seen={studentId ? seenOf(q) : undefined} />
                    </button>
                    <span className="rowacts">
                      <button type="button" className={`btn sm${added ? " ghost" : ""}`} onClick={() => toggle(q.id)}>
                        {added ? "Added ✓" : "Add"}
                      </button>
                    </span>
                    {open === `bank:${q.id}` && <PreviewPanel id={q.id} />}
                  </li>
                );
              })}
              {visible.length > shown.length && (
                <li className="muted" style={{ display: "block", fontSize: 14 }}>
                  Showing {shown.length} of {visible.length}. Narrow the options or search to see the rest.
                </li>
              )}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
