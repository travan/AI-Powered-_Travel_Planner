"use client";
import React from "react";
import { PRIMARY_NAVIGATION, isNavigationActive } from "./navigation";
import { useTranslations } from "next-intl";
import { UiText } from "../i18n/UiText";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function BottomNav() {
  const pathname = usePathname();
  const navigationText = useTranslations("common");

  return (
    <nav
      aria-label={navigationText("main_navigation")}
      data-testid="mobile-navigation"
      className="md:hidden fixed bottom-0 inset-x-0 z-50 grid grid-cols-4 gap-1 rounded-t-3xl bg-white/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-2xl shadow-[0_-4px_24px_rgba(0,93,144,0.06)]"
    >
      {PRIMARY_NAVIGATION.map((item) => {
        const active = isNavigationActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-w-0 min-h-16 flex-col items-center justify-center rounded-2xl px-1 py-2 transition-colors ${
              active
                ? "bg-sky-100 text-sky-900"
                : "text-slate-400 hover:text-sky-600"
            }`}
          >
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[24px]"
              style={
                active
                  ? {
                      fontVariationSettings:
                        "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24",
                    }
                  : undefined
              }
            >
              {item.icon}
            </span>
            <span className="mt-1 min-h-7 w-full text-center font-body text-[11px] font-semibold leading-tight">
              <UiText text={item.label} />
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
