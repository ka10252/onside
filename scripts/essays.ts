// The (a)+(b) essay sets whose theme a unit returns to most, for the revision notes.
//   npx tsx scripts/essays.ts 16
import Module from "node:module";
import path from "node:path";
const m = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
const original = m._resolveFilename;
m._resolveFilename = function (req: string, ...rest: unknown[]) {
  if (req === "server-only") return path.join(process.cwd(), "scripts", "empty.cjs");
  return original.call(this, req, ...rest);
};
import { loadEnv } from "./env";

const STOP = new Set(
  `using real-world examples information from the text data and your knowledge of economics discuss evaluate explain
   the a an to for of in on with that this these those may might can could is are be been it its as by at or if
   country economy economic government policy policies effect effects impact impacts likely consequences view`
    .split(/\s+/)
    .filter(Boolean),
);
const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/\*\*/g, "")
      .replace(/[^a-z\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP.has(w)),
  );

async function main() {
  loadEnv();
  const unit = Number(process.argv[2]);
  const { all } = await import("../src/lib/db");
  const rows = await all<{ label: string; marks: number; prompt: string; session: string }>(
    `SELECT (q.data::jsonb) #>> '{past,label}' AS label, q.marks, q.prompt, p.session
       FROM questions q JOIN units u ON u.id = q.unit_id JOIN past_items p ON p.id = substr(q.id, 4)
      WHERE u.number = ? AND q.source = 'past' AND q.marks >= 10 ORDER BY p.session DESC`,
    unit,
  );
  const stem = (l: string) => l.replace(/\((a|b)\)\s*$/i, "").trim();
  const sets = new Map<string, typeof rows>();
  for (const r of rows) if (/\((a|b)\)\s*$/i.test(r.label)) sets.set(stem(r.label), [...(sets.get(stem(r.label)) ?? []), r]);
  const whole = [...sets.entries()].filter(([, v]) => v.length >= 2);

  // How often the rest of the unit asks about the same things.
  const score = (v: typeof rows) => {
    const mine = words(v.map((x) => x.prompt).join(" "));
    let n = 0;
    for (const r of rows) {
      if (v.includes(r)) continue;
      const theirs = words(r.prompt);
      let shared = 0;
      for (const w of mine) if (theirs.has(w)) shared++;
      if (shared >= 2) n++;
    }
    return n;
  };
  const ranked = whole
    .map(([k, v]) => ({ k, v: [...v].sort((a, b) => a.label.localeCompare(b.label)), n: score(v) }))
    .sort((a, b) => b.n - a.n || b.v[0]!.session.localeCompare(a.v[0]!.session))
    .slice(0, 3);

  console.log(`### Paper 1 essays — the sets this unit keeps coming back to\n`);
  for (const { v, n } of ranked) {
    console.log(`**${v[0]!.label.replace(/\((a|b)\)\s*$/, "").trim()}** — ${n} other essays in this unit ask about the same ground`);
    for (const r of v) {
      const part = r.label.match(/\((a|b)\)/)?.[0] ?? "";
      console.log(`- ${part} **[${r.marks}]** ${r.prompt.replace(/\s+/g, " ").replace(/\*\*/g, "")}`);
    }
    console.log("");
  }
  process.exit(0);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
