import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The home folder has its own package-lock.json; pin the project root.
  turbopack: { root: __dirname },
  // PGlite (the local database) ships 25 MB of WebAssembly. It is only used when DATABASE_URL is
  // unset, so keep it out of the bundle and out of what gets deployed.
  serverExternalPackages: ["@electric-sql/pglite"],
  outputFileTracingExcludes: { "*": ["node_modules/@electric-sql/pglite/**"] },
  // Diagram photos go through a server action. The browser shrinks them first; Vercel caps request bodies at 4.5 MB.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};

export default nextConfig;
