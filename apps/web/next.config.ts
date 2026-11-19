import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");
const apiProxyTarget =
  process.env["E2E_API_PROXY_TARGET"] ??
  process.env["API_PROXY_TARGET"] ??
  "http://127.0.0.1:3001";

const nextConfig: NextConfig = {
  // Keep the development indicator clear of the mobile navigation in previews.
  devIndicators: false,
  // Preserve the browser origin when auth middleware redirects loopback URLs.
  skipMiddlewareUrlNormalize: true,
  env: {
    // The first-party API owns auth by default. Supabase remains opt-in via
    // AUTH_PROVIDER=supabase (or NEXT_PUBLIC_AUTH_PROVIDER=supabase).
    AUTH_PROVIDER: process.env["AUTH_PROVIDER"] ?? "local",
    NEXT_PUBLIC_AUTH_PROVIDER:
      process.env["NEXT_PUBLIC_AUTH_PROVIDER"] ?? "local",
    NEXT_PUBLIC_API_URL:
      process.env["E2E_NEXT_PUBLIC_API_URL"] ??
      process.env["NEXT_PUBLIC_API_URL"] ??
      "",
    ENABLE_MOCK_AUTH_SERVER: process.env["ENABLE_MOCK_AUTH_SERVER"] ?? "false",
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "maps.googleapis.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  experimental: {
    // Detailed local itineraries scale up to 15 minutes; allow the provider to finish.
    proxyTimeout: 960_000,
    serverActions: { allowedOrigins: ["localhost:3000"] },
  },
  async headers() {
    return [{
      source: "/((?!api/|_next/).*)",
      headers: [{
        key: "Content-Security-Policy-Report-Only",
        // Static App Router pages contain inline hydration scripts. A strict
        // nonce policy requires dynamic rendering; keep this report-only policy
        // compatible with the rendering strategy and the icon stylesheet.
        value: `default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https:${process.env.NODE_ENV === "development" ? " ws: wss:" : ""}`,
      }],
    }];
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiProxyTarget}/api/:path*`,
      },
      {
        source: "/health",
        destination: `${apiProxyTarget}/health`,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
