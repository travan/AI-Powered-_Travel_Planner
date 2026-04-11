import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createServerClient } from "../../../lib/supabase/server";
import { getItinerary } from "../../../lib/api";
import { OverviewCard } from "../../../components/itinerary/OverviewCard";
import { DayTimeline } from "../../../components/itinerary/DayTimeline";
import { TransportSection } from "../../../components/itinerary/TransportSection";
import { SeasonalNote } from "../../../components/itinerary/SeasonalNote";
import { BudgetBreakdown } from "../../../components/itinerary/BudgetBreakdown";
import { ShareButton } from "../../../components/itinerary/ShareButton";
import type { ItineraryOutput } from "@travel/types";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const data = await getItinerary(id);
    return { title: data.overview?.title ?? "Travel Itinerary" };
  } catch {
    return { title: "Travel Itinerary" };
  }
}

export default async function ItineraryDetailPage({ params }: PageProps) {
  const { id } = await params;
  let itinerary: ItineraryOutput;

  try {
    itinerary = await getItinerary(id);
  } catch {
    notFound();
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isSaved = false; // TODO: query saved_trips table

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 space-y-8">
      {/* Action bar */}
      <div className="flex items-center justify-between">
        <a href="/plan" className="text-sm text-primary hover:underline">
          ← Plan another trip
        </a>
        <div className="flex gap-2">
          {user && (
            <button
              className="rounded-lg border border-outline-variant bg-surface px-4 py-2 text-sm font-medium text-on-surface hover:bg-surface-container-low transition-colors"
            >
              {isSaved ? "Saved ✓" : "Save Trip"}
            </button>
          )}
          <ShareButton />
        </div>
      </div>

      {/* Overview */}
      {itinerary.overview && <OverviewCard overview={itinerary.overview} />}

      {/* Seasonal notes */}
      {itinerary.seasonal_notes && <SeasonalNote notes={itinerary.seasonal_notes} />}

      {/* Transport */}
      {itinerary.transport_options && itinerary.transport_options.length > 0 && (
        <TransportSection segments={itinerary.transport_options} />
      )}

      {/* Day Timeline */}
      {itinerary.days && itinerary.days.length > 0 && (
        <DayTimeline days={itinerary.days} />
      )}

      {/* Budget */}
      {itinerary.budget_breakdown && (
        <BudgetBreakdown breakdown={itinerary.budget_breakdown} />
      )}
    </main>
  );
}
