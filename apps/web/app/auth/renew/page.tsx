"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../../lib/supabase/client";

export default function RenewSessionPage() {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void createClient()
      .auth.getSession()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setFailed(true);
          return;
        }
        const path =
          new URLSearchParams(window.location.search).get("returnTo") ??
          "/plan";
        const target = new URL(path, window.location.origin);
        const safe =
          target.origin === window.location.origin &&
          target.pathname !== "/auth/renew";
        window.location.replace(
          data.session && safe ? target.pathname + target.search : "/login",
        );
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-6">
      <div
        role="status"
        className="rounded-3xl border border-primary/20 bg-surface-container-lowest p-8 text-primary"
      >
        {failed ? (
          <button
            className="font-bold underline"
            onClick={() => window.location.reload()}
          >
            Retry / Thử lại
          </button>
        ) : (
          <span
            aria-label="Loading"
            className="material-symbols-outlined motion-safe:animate-spin"
          >
            progress_activity
          </span>
        )}
      </div>
    </main>
  );
}
