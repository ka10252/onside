// How long the database takes to answer from the running server. No data, just milliseconds,
// so a slow page can be told apart from a slow database. `?deep=1` also times the work behind
// the tutor's screens, one loader at a time.
import { all, one } from "@/lib/db";
import { listStudents, assignmentsForStudent, studentStats, bankParts } from "@/lib/admin";
import { conceptBoard } from "@/lib/concept-board";
import { latestSummary } from "@/lib/review";
import { unitTestProgress } from "@/lib/unit-progress";
import { getSchedule, upcomingSends } from "@/lib/schedule";
import { loadReview } from "@/lib/review";
import { closeExpiredAssignments } from "@/lib/student";

export const maxDuration = 60;

export async function GET(req: Request) {
  const started = Date.now();
  const ms: Record<string, number> = {};
  const time = async (label: string, fn: () => Promise<unknown>) => {
    const t = Date.now();
    try {
      await fn();
    } catch {
      ms[label + " (failed)"] = Date.now() - t;
      return;
    }
    ms[label] = Date.now() - t;
  };
  try {
    await time("connect + SELECT 1", () => all("SELECT 1"));
    await time("SELECT 1 again", () => all("SELECT 1"));
    if (new URL(req.url).searchParams.get("deep") === "1") {
      await time("listStudents", () => listStudents());
      const student = await one<{ id: string }>("SELECT id FROM users WHERE role = 'student' AND archived_at IS NULL LIMIT 1");
      if (student) {
        const id = student.id;
        await time("assignmentsForStudent", () => assignmentsForStudent(id));
        await time("unitTestProgress", () => unitTestProgress(id));
        await time("conceptBoard", () => conceptBoard(id));
        await time("studentStats", () => studentStats(id));
        await time("latestSummary", () => latestSummary(id));
        await time("bankParts", () => bankParts());
        await time("bankParts again", () => bankParts());
        const s = await getSchedule(id);
        await time("upcomingSends (28 days)", async () => upcomingSends(s, 28));
        // The student's own screens, for comparison.
        await time("student: closeExpiredAssignments", () => closeExpiredAssignments());
        const asg = await one<{ id: string }>("SELECT id FROM assignments WHERE student_id = ? ORDER BY assigned_at DESC LIMIT 1", id);
        if (asg) await time("student: loadReview (results screen)", () => loadReview(asg.id));
      }
    }
    return Response.json({ ok: true, totalMs: Date.now() - started, ms });
  } catch (e) {
    return Response.json(
      { ok: false, totalMs: Date.now() - started, ms, error: e instanceof Error ? e.message.slice(0, 200) : "unknown" },
      { status: 503 },
    );
  }
}
