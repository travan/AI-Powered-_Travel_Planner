"use client";
import React, { useState, useEffect } from "react";
import { createClient } from "../../lib/supabase/client";
import { journeyRequest } from "../../lib/journey-api";
import { useAppLanguage } from "../i18n/LanguageProvider";
type Candidate = {
  source_id: string;
  name: string;
  display_name: string;
  country: string;
};
export function ResolveCitySearch({
  query,
  onSelect,
}: {
  query: string;
  onSelect: (
    slug: string,
    name: string,
    names?: Record<string, string>,
  ) => void;
}) {
  const { locale } = useAppLanguage(),
    vi = locale === "vi";
  const [candidates, setCandidates] = useState<Candidate[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    setCandidates([]);
    setMessage("");
  }, [query]);
  const run = async (candidate?: Candidate) => {
    setBusy(true);
    setMessage("");
    const current = query.trim();
    try {
      const { data } = await createClient().auth.getSession();
      if (!data.session) {
        setMessage(
          vi
            ? "Đăng nhập để xác định và thêm thành phố mới."
            : "Sign in to identify and add a new city.",
        );
        return;
      }
      if (candidate) {
        const city = await journeyRequest<{
          slug: string;
          name: Record<string, string>;
        }>("cities/resolve", data.session.access_token, {
          query: current,
          source_id: candidate.source_id,
        });
        onSelect(
          city.slug,
          city.name[locale] ?? city.name.en ?? city.slug,
          city.name,
        );
      } else {
        const result = await journeyRequest<{ candidates: Candidate[] }>(
          `cities/resolve/search?q=${encodeURIComponent(current)}`,
          data.session.access_token,
        );
        setCandidates(result.candidates);
        if (!result.candidates.length)
          setMessage(
            vi
              ? "Chưa tìm thấy. Thử thêm quốc gia hoặc tỉnh/thành."
              : "No results. Include a country or region.",
          );
      }
    } catch {
      setMessage(
        vi
          ? "Chưa thể xác định thành phố. Chờ một giây và thử lại với tên kèm quốc gia."
          : "Unable to identify the city. Wait a second and retry with its country.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={busy || query.trim().length < 3}
        onClick={() => run()}
        className="text-sm font-semibold text-primary underline"
      >
        {busy
          ? vi
            ? "Đang xác định…"
            : "Identifying…"
          : vi
            ? "Tìm thành phố mới theo quốc gia / khu vực"
            : "Find a new city by country / region"}
      </button>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      {candidates.map((c) => (
        <button
          key={c.source_id}
          type="button"
          disabled={busy}
          onClick={() => run(c)}
          className="block text-left text-sm text-primary underline"
        >
          {c.display_name} ({c.country})
        </button>
      ))}
      {candidates.length > 0 && (
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
          className="block text-xs underline"
        >
          © OpenStreetMap contributors
        </a>
      )}
    </div>
  );
}
