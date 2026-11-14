import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      // ponytail: allow conditional revalidation (304) on JSON room responses without caching
      // them; the SSE stream sets its own no-cache headers at runtime.
      {
        source: "/api/room",
        headers: [
          { key: "Cache-Control", value: "private, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
