"use client";

import { useEffect, useState } from "react";
import type { UserProfileSummary } from "@travel/types";
import { SiteHeader } from "../../../components/layout/SiteHeader";
import { getMyProfile } from "../../../lib/api";
import { createClient } from "../../../lib/supabase/client";

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfileSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          setError("Please sign in to view your profile.");
          return;
        }

        const nextProfile = await getMyProfile(session.access_token);
        if (!cancelled) setProfile(nextProfile);
      } catch {
        if (!cancelled) setError("Unable to load your profile.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-on-surface">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10" data-testid="web-profile-page">
        <section className="rounded-3xl border border-outline-variant/30 bg-surface p-8 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">Profile</p>
          {error && <p className="mt-4 rounded-xl bg-error/10 p-4 text-sm font-semibold text-error">{error}</p>}
          {!profile && !error && <p className="mt-4 text-sm text-on-surface-variant">Loading profile...</p>}
          {profile && (
            <div className="mt-6 space-y-5">
              <div>
                <h1 className="font-headline text-4xl font-extrabold">{profile.display_name}</h1>
                <p className="mt-1 text-on-surface-variant">{profile.email}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Info label="Home city" value={profile.home_city_slug ?? "Not set"} />
                <Info label="User id" value={profile.user_id.slice(0, 8)} />
              </div>
              <div className="rounded-2xl bg-surface-container-low p-5">
                <p className="text-sm font-bold uppercase tracking-wide text-outline">Preferences</p>
                <pre className="mt-3 overflow-auto text-sm text-on-surface-variant">
                  {JSON.stringify(profile.travel_preferences, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-surface-container-low p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-outline">{label}</p>
      <p className="mt-2 font-semibold">{value}</p>
    </div>
  );
}
