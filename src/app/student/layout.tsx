import { requireUser } from "@/lib/session";

export default async function StudentLayout({ children }: LayoutProps<"/student">) {
  await requireUser("student");
  return children;
}
