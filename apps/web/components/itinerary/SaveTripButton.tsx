"use client";
import { UiText } from "../i18n/UiText";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveTrip } from "../../lib/api";
import { createClient } from "../../lib/supabase/client";

export function SaveTripButton({ itineraryId }: { itineraryId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSave() {
    if (state === "saving") return;
    setState("saving");
    setMessage(null);

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        router.push(
          `/login?redirectTo=${encodeURIComponent(`/itinerary/${itineraryId}`)}`,
        );
        return;
      }

      const result = await saveTrip(itineraryId, session.access_token);
      router.push(`/trips/${result.trip_id}/workspace`);
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error ? error.message : "Could not save this trip.",
      );
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        data-testid="save-trip"
        onClick={handleSave}
        disabled={state === "saving"}
        className="rounded-lg border border-primary bg-surface px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary-container disabled:cursor-wait disabled:opacity-60"
      >
        {state === "saving" ? (
          <UiText id="tbcd86014b365" fallback="Saving to My trips…" />
        ) : (
          <UiText
            id="te2d55f42a39a"
            fallback="Save to My trips & open workspace"
          />
        )}
      </button>
      {message && (
        <span role="alert" className="max-w-56 text-right text-xs text-error">
          <UiText text={message} />
        </span>
      )}
    </div>
  );
}
