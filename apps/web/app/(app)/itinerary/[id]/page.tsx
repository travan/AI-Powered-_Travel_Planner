import { ItineraryContents } from "../../../../components/itinerary/ItineraryContents";

import { UiText } from "../../../../components/i18n/UiText";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "../../../../lib/supabase/server";
import { ApiRequestError, getItinerary } from "../../../../lib/api";
import { SaveTripButton } from "../../../../components/itinerary/SaveTripButton";
import { ShareButton } from "../../../../components/itinerary/ShareButton";
import type { Itinerary } from "@travel/types";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const data = await getItinerary(id);
    return { title: data.itineraries?.[0]?.title ?? "Travel Itinerary" };
  } catch {
    return { title: "Travel Itinerary" };
  }
}

export default async function ItineraryDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    redirect(`/login?redirectTo=${encodeURIComponent(`/itinerary/${id}`)}`);
  }

  let itinerary: Itinerary;
  let canShare = false;

  try {
    const data = await getItinerary(id, session?.access_token);
    canShare = data.can_share === true;
    itinerary = data.itineraries?.[0] as Itinerary;
    if (!itinerary) notFound();
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) notFound();
    throw error;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 space-y-8">
      {/* Action bar */}
      <div className="flex items-center justify-between">
        <Link href="/plan" className="text-sm text-primary hover:underline">
          {" "}
          <UiText id="t4a50522901e7" fallback="← Plan another trip" />{" "}
        </Link>
        <div className="flex gap-2">
          {user && <SaveTripButton itineraryId={id} />}
          {canShare && <ShareButton itineraryId={id} />}
        </div>
      </div>

      <ItineraryContents
        plan={itinerary}
        sourceId={id}
        token={session.access_token}
      />
    </main>
  );
}
