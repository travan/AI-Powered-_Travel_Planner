"use client";
import React, { createContext, useContext, useState } from "react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../messages/en.json";
import vi from "../../messages/vi.json";
export type AppLocale = "en" | "vi";
const LanguageContext = createContext<{
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
}>({ locale: "en", setLocale: () => {} });
export function useAppLanguage() {
  return useContext(LanguageContext);
}
export function LanguageProvider({
  initialLocale,
  children,
}: {
  initialLocale: string;
  children: React.ReactNode;
}) {
  const [locale, update] = useState<AppLocale>(
    initialLocale === "vi" ? "vi" : "en",
  );
  const setLocale = (next: AppLocale) => {
    document.cookie = `locale=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    document.documentElement.lang = next;
    update(next);
  };
  return (
    <LanguageContext.Provider value={{ locale, setLocale }}>
      <NextIntlClientProvider
        locale={locale}
        messages={locale === "vi" ? vi : en}
        timeZone="Asia/Ho_Chi_Minh"
      >
        {
          children as React.ComponentProps<
            typeof NextIntlClientProvider
          >["children"]
        }
        <div
          className="fixed bottom-24 right-3 z-50 flex gap-1 rounded-full border border-outline-variant/30 bg-surface p-1 shadow-lg lg:bottom-5"
          role="group"
          aria-label={(locale === "vi" ? vi : en).common.language}
        >
          {(["en", "vi"] as const).map((language) => (
            <button
              key={language}
              type="button"
              lang={language}
              aria-pressed={locale === language}
              onClick={() => setLocale(language)}
              className={`rounded-full px-3 py-2 text-sm font-bold ${locale === language ? "bg-primary text-on-primary" : "text-on-surface"}`}
            >
              {language.toUpperCase()}
            </button>
          ))}
        </div>
      </NextIntlClientProvider>
    </LanguageContext.Provider>
  );
}
