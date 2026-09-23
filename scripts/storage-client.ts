// Private file storage for scripts: Supabase Storage when configured, else data/storage (like src/lib/storage.ts).
import fs from "node:fs";
import path from "node:path";

export const BUCKET = "onside";

export function createStorageClient() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || process.env.ONSIDE_DB === "local") {
    const root = path.join(process.cwd(), "data", "storage");
    return {
      where: "data/storage",
      async put(k: string, body: Buffer) {
        const file = path.join(root, k);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, body);
        return true;
      },
      async ensureBucket() {},
    };
  }
  const headers = { Authorization: `Bearer ${key}`, apikey: key };
  return {
    where: `Supabase Storage (${BUCKET})`,
    async put(k: string, body: Buffer, type: string) {
      const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${k}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": type, "x-upsert": "true" },
        body: new Uint8Array(body),
      });
      if (!res.ok) throw new Error(`Upload of ${k} failed: ${res.status} ${await res.text()}`);
      return true;
    },
    /** Creates the private bucket if it doesn't exist. */
    async ensureBucket() {
      const res = await fetch(`${url}/storage/v1/bucket`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false, file_size_limit: 15 * 1024 * 1024 }),
      });
      if (!res.ok && res.status !== 409) {
        const text = await res.text();
        if (!/already exists/i.test(text)) throw new Error(`Creating the storage bucket failed: ${res.status} ${text}`);
      }
    },
  };
}
