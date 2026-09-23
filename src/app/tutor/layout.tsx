import { after } from "next/server";
import { pollMarkingBatches } from "@/lib/ai/marking";
import { one } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { closeExpiredAssignments } from "@/lib/student";

export default async function TutorLayout({ children }: LayoutProps<"/tutor">) {
  await requireUser("tutor");
  await closeExpiredAssignments(); // timed sets whose student closed the tab
  // No always-on server on Vercel: collect finished AI marking batches when the tutor looks.
  if (await one("SELECT 1 FROM ai_batches WHERE status = 'pending' LIMIT 1")) {
    after(() => pollMarkingBatches().catch((e) => console.error("batch poll failed", e)));
  }
  return children;
}
