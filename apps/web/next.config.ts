import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");
const apiProxyTarget =
  process.env["E2E_API_PROXY_TARGET"] ??
  process.env["API_PROXY_TARGET"] ??
  "http://127.0.0.1:3001";

const nextConfig: NextConfig = {
  env: {
    // The first-party API owns auth by default. Supabase remains opt-in via
    // AUTH_PROVIDER=supabase (or NEXT_PUBLIC_AUTH_PROVIDER=supabase).
    AUTH_PROVIDER: process.env["AUTH_PROVIDER"] ?? "local",
    NEXT_PUBLIC_AUTH_PROVIDER: process.env["NEXT_PUBLIC_AUTH_PROVIDER"] ?? "local",
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
    serverActions: { allowedOrigins: ["localhost:3000"] },
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
