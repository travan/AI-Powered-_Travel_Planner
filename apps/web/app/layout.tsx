import type { Metadata } from "next";
import { LanguageProvider } from "../components/i18n/LanguageProvider";
import coHorizonMark from "../components/layout/co-horizon-mark.svg";
import { getLocale } from "next-intl/server";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "CoHorizon", template: "%s | CoHorizon" },
  description:
    "Plan your itinerary, share it with friends, and manage your trip together.",
  icons: { icon: { url: coHorizonMark.src, type: "image/svg+xml" } },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();

  return (
    <html lang={locale}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
        />
      </head>
      <body className="min-h-screen antialiased">
        <LanguageProvider initialLocale={locale}>{children}</LanguageProvider>
      </body>
    </html>
  );
}
