import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The home folder has its own package-lock.json; pin the project root.
  turbopack: { root: __dirname },
  // PGlite (local database) ships WebAssembly files; keep it out of the bundle.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Diagram photos go through a server action. The browser shrinks them first; Vercel caps request bodies at 4.5 MB.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};

export default nextConfig;
