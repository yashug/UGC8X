import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Remotion spawns a headless browser and reads from disk at runtime. Bundling
  // it into the server build breaks both, so it stays external.
  serverExternalPackages: [
    "@remotion/bundler",
    "@remotion/renderer",
    "remotion",
  ],
};

export default nextConfig;
