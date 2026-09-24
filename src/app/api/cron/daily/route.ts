import { revalidatePath } from "next/cache";
import { runSchedules } from "@/lib/schedule";

// Daily practice. Vercel calls this once a morning (see "crons" in vercel.json) with the
// CRON_SECRET as a bearer token. Nothing happens for students whose schedule is off.
export const maxDuration = 120;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Not allowed", { status: 401 });
  }
  const results = await runSchedules();
  revalidatePath("/tutor", "layout");
  revalidatePath("/student", "layout");
  console.log("daily practice:", results.map((r) => `${r.student}: ${r.result}`).join(" · ") || "no schedules on");
  return Response.json({ ran: new Date().toISOString(), results });
}
