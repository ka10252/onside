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
  const unit = Number(process.argv[2]);
  const { all } = await import("../src/lib/db");
  const q = <T>(sql: string) => all<T extends object ? T : never>(sql, unit);
  console.log(`=== UNIT ${unit} ===\n`);
  for (const [label, col] of [["다이어그램", "diagram_type"], ["command", "command_term"]] as const) {
    const rows = await q<{ v: string; n: number }>(
      `SELECT ${col} AS v, COUNT(*)::int AS n FROM past_items WHERE unit_number=? AND ${col} IS NOT NULL AND ${col}<>'' GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
    );
    console.log(`${label}: ${rows.map((r) => `${r.v}×${r.n}`).join(" · ")}`);
  }
  const defs = await q<{ term: string; ms: string }>(
    `SELECT p.defined_term AS term, (q.data::jsonb) #>> '{marking,text}' AS ms
       FROM questions q JOIN units u ON u.id=q.unit_id JOIN past_items p ON p.id=substr(q.id,4)
      WHERE u.number=? AND p.command_term='define' AND p.defined_term IS NOT NULL ORDER BY p.defined_term`,
  );
  console.log(`\n정의 ${defs.length}개 — 마크스킴 Level 2:`);
  for (const d of defs) {
    const lvl2 = (d.ms ?? "").replace(/\s+/g, " ").match(/2\s*Accurate definition\s*2?\s*(.{0,230})/i);
    console.log(`  ■ ${d.term}\n     ${lvl2?.[1] ?? "(없음)"}`);
  }
  const ex = await q<{ label: string; marks: number; cmd: string; diag: string | null; prompt: string }>(
    `SELECT (q.data::jsonb) #>> '{past,label}' AS label, q.marks, p.command_term AS cmd, p.diagram_type AS diag, q.prompt
       FROM questions q JOIN units u ON u.id=q.unit_id JOIN past_items p ON p.id=substr(q.id,4)
      WHERE u.number=? AND q.marks BETWEEN 4 AND 9 ORDER BY p.session DESC LIMIT 14`,
  );
  console.log(`\n설명문항(4–9점) 최근 ${ex.length}개:`);
  for (const r of ex) console.log(`  ${r.marks}m ${r.diag ?? ""} · ${r.prompt.replace(/\s+/g, " ").slice(0, 92)}`);
  const es = await q<{ label: string; marks: number; prompt: string }>(
    `SELECT (q.data::jsonb) #>> '{past,label}' AS label, q.marks, q.prompt
       FROM questions q JOIN units u ON u.id=q.unit_id JOIN past_items p ON p.id=substr(q.id,4)
      WHERE u.number=? AND q.marks>=10 ORDER BY p.session DESC LIMIT 10`,
  );
  console.log(`\n에세이 최근 ${es.length}개:`);
  for (const r of es) console.log(`  ${r.marks}m · ${r.prompt.replace(/\s+/g, " ").slice(0, 95)}`);
  process.exit(0);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
