import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { DATA_DIR } from "@/lib/db-core";
import { currentUser } from "@/lib/session";

// Diagram photo for a response. The tutor sees all; a student only their own.
const TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".heic": "image/heic" };

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  const id = new URL(req.url).searchParams.get("r") ?? "";
  const row = db().prepare("SELECT student_id, photo_path FROM responses WHERE id = ?").get(id) as
    | { student_id: string; photo_path: string | null }
    | undefined;
  if (!row?.photo_path || (user.role !== "tutor" && row.student_id !== user.id)) return new Response("Not found", { status: 404 });
  const file = path.resolve(DATA_DIR, row.photo_path);
  if (!file.startsWith(path.join(DATA_DIR, "uploads") + path.sep)) return new Response("Not found", { status: 404 });
  try {
    const body = await fs.readFile(file);
    return new Response(body, {
      headers: { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream", "Cache-Control": "private, no-store" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
