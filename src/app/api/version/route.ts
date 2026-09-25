// Which build is serving. A page that was open when a new one went live can notice and say so,
// because Vercel gives each deployment its own Server Action addresses and the old ones stop working.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { id: process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" },
    { headers: { "cache-control": "no-store" } },
  );
}
