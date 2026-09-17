import { requireUser } from "@/lib/session";
import { closeExpiredAssignments } from "@/lib/student";

export default async function TutorLayout({ children }: LayoutProps<"/tutor">) {
  await requireUser("tutor");
  closeExpiredAssignments(); // timed sets whose student closed the tab
  return children;
}
