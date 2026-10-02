// Does the recap actually let a student answer the questions the template picks?
import Module from "node:module";
import path from "node:path";
const m = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
const original = m._resolveFilename;
m._resolveFilename = function (req: string, ...rest: unknown[]) {
  if (req === "server-only") return path.join(process.cwd(), "scripts", "empty.cjs");
  return original.call(this, req, ...rest);
};
import { loadEnv } from "./env";

async function main() {
  loadEnv();
  const unit = Number(process.argv[2] ?? 16);
  const { one } = await import("../src/lib/db");
  const { fillTemplate } = await import("../src/lib/lesson-template");
  const { unitBrief } = await import("../src/lib/lesson");
  const s = (await one<{ id: string }>("SELECT id FROM users WHERE role='student' AND archived_at IS NULL LIMIT 1"))!;
  const brief = await unitBrief(unit);
  const notes = (brief?.notes?.body ?? "").toLowerCase();
  if (!notes) {
    console.log("이 단원에는 복습 노트가 없습니다.");
    process.exit(1);
  }
  const { picked } = await fillTemplate(unit, s.id);

  // The ideas a question leans on, in the words a note would use.
  const IDEAS: [RegExp, string][] = [
    [/exchange rate diagram|appreciat|depreciat/i, "exchange rate diagram"],
    [/ad\/as|aggregate demand|aggregate supply/i, "ad/as"],
    [/current account|balance of payments|financial account|balance of trade/i, "balance of payments"],
    [/define the term/i, "definition"],
    [/calculate|percentage change|show that/i, "calculation"],
    [/inflation/i, "inflation"],
    [/interest rate/i, "interest rate"],
    [/central bank|reserve/i, "central bank"],
    [/speculat/i, "speculation"],
    [/remittance/i, "remittances"],
    [/portfolio/i, "portfolio investment"],
    [/fiscal policy/i, "fiscal policy"],
    [/monetary policy/i, "monetary policy"],
    [/supply-side/i, "supply-side"],
    [/multiplier/i, "multiplier"],
    [/crowding out/i, "crowding out"],
    [/unemployment/i, "unemployment"],
  ];
  const covered = (idea: string) => notes.includes(idea.toLowerCase());

  console.log(`UNIT ${unit} — 템플릿 ${picked.length}문항이 노트로 풀리는가\n`);
  const gaps = new Map<string, number>();
  for (const q of picked) {
    const needs = IDEAS.filter(([re]) => re.test(q.prompt)).map(([, name]) => name);
    const missing = needs.filter((n) => !covered(n));
    for (const n of missing) gaps.set(n, (gaps.get(n) ?? 0) + 1);
    const mark = missing.length === 0 ? "✓" : "⚠";
    console.log(
      `  ${mark} ${String(q.marks).padStart(2)}m ${(q.past_label ?? "unit test").padEnd(26)} ${needs.join(", ") || "(일반)"}` +
        (missing.length ? `  ← 노트에 없음: ${missing.join(", ")}` : ""),
    );
  }
  console.log(gaps.size === 0 ? "\n모든 문항이 노트 범위 안에 있습니다." : `\n노트에서 빠진 것: ${[...gaps].map(([k, v]) => `${k}(${v}문항)`).join(" · ")}`);
  process.exit(0);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
