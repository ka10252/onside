import { currentUser } from "@/lib/session";
import { getFile } from "@/lib/storage";

// Figures and tables cropped from past papers. Private storage, signed-in users only.
export async function GET(_req: Request, ctx: RouteContext<"/api/past-img/[...path]">) {
  if (!(await currentUser())) return new Response("Not signed in", { status: 401 });
  const { path: parts } = await ctx.params;
  if (parts.some((p) => !/^[\w.-]+$/.test(p) || p.startsWith(".")) || !parts.at(-1)?.endsWith(".png")) {
    return new Response("Not found", { status: 404 });
  }
  const body = await getFile(`past-img/${parts.join("/")}`);
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(body), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600" } });
}
