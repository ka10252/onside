// Scripts: load .env.local like Next.js does (the app gets it from Next).
import path from "node:path";

export function loadEnv() {
  for (const f of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(path.join(process.cwd(), f));
    } catch {
      // missing file
    }
  }
}
