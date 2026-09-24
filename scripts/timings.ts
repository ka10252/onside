import Module from "node:module";
import path from "node:path";
const m = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
const original = m._resolveFilename;
m._resolveFilename = function (req: string, ...rest: unknown[]) {
  if (req === "server-only") return path.join(process.cwd(), "scripts", "empty.cjs");
  return original.call(this, req, ...rest);
};
import { loadEnv } from "./env";

async function time<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t = Date.now();
  const out = await fn();
  console.log(`${String(Date.now() - t).padStart(6)} ms  ${label}`);
  return out;
}

async function main() {
  loadEnv();
  const { all, one } = await import("../src/lib/db");
  const { listStudents, assignmentsForStudent, studentStats, bankParts, bankQuestions } = await import("../src/lib/admin");
  const { latestSummary } = await import("../src/lib/review");
  const { conceptBoard } = await import("../src/lib/concept-board");
  const { unitTestProgress } = await import("../src/lib/unit-progress");
  const { getSchedule } = await import("../src/lib/schedule");
  await time("connect + SELECT 1", () => all("SELECT 1"));
  const student = (await one<{ id: string }>("SELECT id FROM users WHERE role = 'student' LIMIT 1"))!;
  await time("students list page: listStudents", () => listStudents());
  await time("dashboard: assignmentsForStudent", () => assignmentsForStudent(student.id));
  await time("dashboard: unitTestProgress", () => unitTestProgress(student.id));
  await time("dashboard: conceptBoard", () => conceptBoard(student.id));
  await time("dashboard: studentStats", () => studentStats(student.id));
  await time("dashboard: latestSummary", () => latestSummary(student.id));
  await time("dashboard: bankParts", () => bankParts());
  await time("dashboard: getSchedule", () => getSchedule(student.id));
  const bank = await time("previews: bankQuestions (whole bank)", () => bankQuestions());
  console.log(`          bank rows: ${bank.length}, about ${Math.round(JSON.stringify(bank).length / 1024)} KB`);
  await time("previews: bankQuestions again", () => bankQuestions());
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
