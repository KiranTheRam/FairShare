import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingIncludes: { "/*": ["./drizzle/**/*"] },
  poweredByHeader: false,
  compress: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "Content-Security-Policy", value: "default-src 'none'; base-uri 'none'; frame-ancestors 'none'" },
        ],
      },
      {
        source: "/sw.js",
        headers: [{ key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'" }],
      },
    ];
  },
};

export default nextConfig;
