"use client";
import React from "react";
import type { BookingLink } from "@travel/types";
import { useAppLanguage } from "../i18n/LanguageProvider";
export function BookingLinks({
  links,
  context,
}: {
  links?: BookingLink[];
  context?: string;
}) {
  const { locale } = useAppLanguage();
  if (!links?.length) return null;
  return (
    <div className="space-y-2 text-sm">
      {context && <p className="text-on-surface-variant">{context}</p>}
      <div className="flex flex-wrap gap-3">
        {links
          .filter((l) => /^https:\/\//.test(l.url))
          .map((l) => (
            <a
              key={l.platform}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-primary underline"
            >
              {l.platform} ·{" "}
              {l.kind === "product"
                ? locale === "vi"
                  ? "Xem dịch vụ"
                  : "View product"
                : locale === "vi"
                  ? "Tìm kiếm"
                  : "Search"}
            </a>
          ))}
      </div>
    </div>
  );
}
