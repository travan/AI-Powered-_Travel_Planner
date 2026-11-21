"use client";
import React from "react";
import type { ScopedPrice } from "@travel/types";
import { useAppLanguage } from "../i18n/LanguageProvider";

export function PriceDetails({ price }: { price?: ScopedPrice }) {
  const { locale } = useAppLanguage();
  if (!price?.original) return null;
  return (
    <p className="text-xs leading-5 text-on-surface-variant">
      {locale === "vi" ? "Giá gốc: " : "Original price: "}
      {price.original.amount.toLocaleString(locale)} {price.original.currency}
      {price.conversion && (
        <>
          {" "}
          · {locale === "vi" ? "Tỷ giá" : "Exchange rate"}:{" "}
          {price.conversion.rate.toLocaleString(locale, {
            maximumFractionDigits: 6,
          })}
          {" · "}
          {new Date(price.conversion.updated_at).toLocaleDateString(locale)}
        </>
      )}
    </p>
  );
}
