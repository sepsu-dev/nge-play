import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  serverExternalPackages: ["youtubei.js"],
  experimental: {
    serverActions: {
      allowedOrigins: [
        "**.*",
        "localhost:3000", 
      ],
    },
  },
};

export default nextConfig;
