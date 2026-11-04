"use client";
import React, { useState } from "react";
import { mapUrl } from "@travel/types";
import { createClient } from "../../lib/supabase/client";
import { fetchWithLocalSession } from "../../lib/session-fetch";
import { useAppLanguage } from "../i18n/LanguageProvider";
export function PlaceLookup({
  citySlug,
  name,
}: {
  citySlug?: string;
  name: string;
}) {
  const { locale } = useAppLanguage(),
    vi = locale === "vi";
  const [candidates, setCandidates] = useState<
    { source_id: string; address: string; lat: number; lon: number }[]
  >([]);
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  if (!citySlug) return null;
  const search = async () => {
    setBusy(true);
    setMessage("");
    try {
      const { data } = await createClient().auth.getSession();
      if (!data.session) {
        setMessage(
          vi ? "Đăng nhập để tra cứu vị trí." : "Sign in to look up locations.",
        );
        return;
      }
      const response = await fetchWithLocalSession(
        `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/cities/${encodeURIComponent(citySlug)}/places/lookup?q=${encodeURIComponent(name)}`,
        { headers: { Authorization: `Bearer ${data.session.access_token}` } },
      );
      if (!response.ok)
        throw new Error(response.status === 429 ? "RATE" : "UNAVAILABLE");
      const body = await response.json();
      setCandidates(body.candidates ?? []);
      if (!body.candidates?.length)
        setMessage(
          vi ? "Chưa tìm thấy vị trí phù hợp." : "No matching locations found.",
        );
    } catch (error) {
      setMessage(
        error instanceof Error && error.message === "RATE"
          ? vi
            ? "Vui lòng chờ một giây rồi thử lại."
            : "Please wait a second and retry."
          : vi
            ? "Chưa thể tra cứu vị trí. Bạn vẫn có thể tìm trên Google Maps."
            : "Location lookup unavailable. You can still search Google Maps.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-2 text-sm space-y-2">
      <button
        type="button"
        onClick={search}
        disabled={busy}
        className="text-primary underline"
      >
        {busy
          ? vi
            ? "Đang tìm…"
            : "Searching…"
          : vi
            ? "Đối chiếu vị trí địa điểm"
            : "Compare place locations"}
      </button>
      {message && <p role="status">{message}</p>}
      {candidates.length > 0 && (
        <>
          <ul className="space-y-2">
            {candidates.map((c) => (
              <li key={c.source_id}>
                <a
                  href={mapUrl({
                    name,
                    address: c.address,
                    lat: c.lat,
                    lon: c.lon,
                    map_precision: "verified",
                  })}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  {c.address}
                </a>
              </li>
            ))}
          </ul>
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs underline"
          >
            © OpenStreetMap contributors
          </a>
        </>
      )}
    </div>
  );
}
