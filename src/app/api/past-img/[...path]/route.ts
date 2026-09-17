import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "@/lib/db-core";
import { currentUser } from "@/lib/session";

// Figures and tables cropped from past papers. Local files, signed-in users only.
const ROOT = path.join(DATA_DIR, "past-papers", "img");

export async function GET(_req: Request, ctx: RouteContext<"/api/past-img/[...path]">) {
  if (!(await currentUser())) return new Response("Not signed in", { status: 401 });
  const { path: parts } = await ctx.params;
  const file = path.resolve(ROOT, ...parts);
  if (!file.startsWith(ROOT + path.sep) || !file.endsWith(".png")) return new Response("Not found", { status: 404 });
  try {
    const body = await fs.readFile(file);
    return new Response(body, { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
