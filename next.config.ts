import type { NextConfig } from "next";

// ponytail: CSP sengaja Report-Only dulu supaya tidak mematahkan iframe YouTube/Next inline
// bootstrap; setelah terbukti bersih di console, ganti key jadi "Content-Security-Policy".
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://www.youtube.com https://www.youtube-nocookie.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://i.ytimg.com https://yt3.ggpht.com https://*.googleusercontent.com",
  "media-src 'self' blob: https://*.googlevideo.com",
  "font-src 'self' data:",
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
  "connect-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://*.googlevideo.com",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  // Hanya berlaku di HTTPS; aman dikirim di HTTP (browser mengabaikannya).
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy },
];

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Batasi ukuran payload Server Action (default 1MB) untuk mengurangi DoS.
      bodySizeLimit: "256kb",
    },
  },
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
