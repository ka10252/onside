import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The home folder has its own package-lock.json; pin the project root.
  turbopack: { root: __dirname },
  // better-sqlite3 is a native module; keep it out of the bundle.
  serverExternalPackages: ["better-sqlite3"],
  // Diagram photos go through a server action; the default 1 MB limit is too small for phone photos.
  experimental: { serverActions: { bodySizeLimit: "15mb" } },
};

export default nextConfig;
