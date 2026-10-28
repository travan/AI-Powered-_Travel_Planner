"use client";
import { useAppLanguage } from "./LanguageProvider";
import en from "../../messages/en.json";
import vi from "../../messages/vi.json";
import sources from "../../messages/ui-sources.json";
const issueAliases = new Map(
  [...Object.entries(en.issues), ...Object.entries(vi.issues)].map(
    ([key, value]) => [value, key],
  ),
);
export function useUiText() {
  const { locale } = useAppLanguage();
  return (text: string) => {
    const issueKey = issueAliases.get(text);
    if (issueKey)
      return (locale === "vi" ? vi.issues : en.issues)[
        issueKey as keyof typeof en.issues
      ];
    const id = sources[text as keyof typeof sources];
    return (locale === "vi" ? vi.ui : en.ui)[id as keyof typeof en.ui] ?? text;
  };
}
export function UiText({
  id,
  fallback,
  text,
}: {
  id?: string;
  fallback?: string;
  text?: string;
}) {
  const { locale } = useAppLanguage();
  const t = useUiText();
  return text !== undefined
    ? t(text)
    : ((locale === "vi" ? vi.ui : en.ui)[id as keyof typeof en.ui] ??
        fallback ??
        id);
}

export function useIssueText() {
  const { locale } = useAppLanguage();
  return (issue: {
    code: string;
    params?: Record<string, string | number>;
    message?: string;
  }) => {
    const catalog = locale === "vi" ? vi.issues : en.issues;
    const template =
      catalog[issue.code as keyof typeof catalog] ??
      issue.message ??
      issue.code;
    return template.replace(/\{(\w+)\}/g, (_, key: string) => {
      const value = issue.params?.[key];
      return typeof value === "number"
        ? new Intl.NumberFormat(locale).format(value)
        : (value ?? "");
    });
  };
}

export function useApiErrorText() {
  const issueText = useIssueText();
  const t = useUiText();
  return (error: unknown, fallback: string) => {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof error.code === "string"
    ) {
      const detail = error as {
        code: string;
        params?: Record<string, string | number>;
        message?: string;
      };
      return issueText(detail);
    }
    return t(error instanceof Error ? error.message : fallback);
  };
}
