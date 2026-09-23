import { one } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { contentTypeOf, getFile } from "@/lib/storage";

// Diagram photo for a response. The tutor sees all; a student only their own.
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  const id = new URL(req.url).searchParams.get("r") ?? "";
  const row = await one<{ student_id: string; photo_path: string | null }>("SELECT student_id, photo_path FROM responses WHERE id = ?", id);
  if (!row?.photo_path || (user.role !== "tutor" && row.student_id !== user.id)) return new Response("Not found", { status: 404 });
  if (!row.photo_path.startsWith("uploads/")) return new Response("Not found", { status: 404 });
  const body = await getFile(row.photo_path);
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(body), {
    headers: { "Content-Type": contentTypeOf(row.photo_path), "Cache-Control": "private, no-store" },
  });
}
