import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "./db-core";

// Private files: students' diagram photos and past-paper figures.
// Supabase Storage (bucket "onside", private) when configured, otherwise data/storage on this computer.
export const BUCKET = "onside";
const LOCAL = path.join(DATA_DIR, "storage");

function supabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url: url.replace(/\/$/, ""), key } : null;
}

const safeKey = (key: string) => {
  const clean = path.posix.normalize(key).replace(/^\/+/, "");
  if (clean.startsWith("..") || clean.includes("\0")) throw new Error("Bad file key");
  return clean;
};

export async function putFile(key: string, body: Buffer, contentType: string) {
  const k = safeKey(key);
  const sb = supabase();
  if (!sb) {
    const file = path.join(LOCAL, k);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body);
    return;
  }
  const res = await fetch(`${sb.url}/storage/v1/object/${BUCKET}/${k}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${sb.key}`, "Content-Type": contentType, "x-upsert": "true" },
    body: new Uint8Array(body),
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
}

export async function getFile(key: string): Promise<Buffer | null> {
  const k = safeKey(key);
  const sb = supabase();
  if (!sb) {
    try {
      return await fs.readFile(path.join(LOCAL, k));
    } catch {
      return null;
    }
  }
  const res = await fetch(`${sb.url}/storage/v1/object/authenticated/${BUCKET}/${k}`, {
    headers: { Authorization: `Bearer ${sb.key}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

export async function deleteFile(key: string) {
  const k = safeKey(key);
  const sb = supabase();
  if (!sb) {
    await fs.rm(path.join(LOCAL, k), { force: true });
    return;
  }
  await fetch(`${sb.url}/storage/v1/object/${BUCKET}/${k}`, { method: "DELETE", headers: { Authorization: `Bearer ${sb.key}` } });
}

export const IMAGE_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};
export const contentTypeOf = (key: string) => IMAGE_TYPES[key.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
