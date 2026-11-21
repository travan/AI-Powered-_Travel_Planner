import { notFound } from "next/navigation";
import { getSharedItinerary, ApiRequestError } from "../../../lib/api";
import { OverviewCard } from "../../../components/itinerary/OverviewCard";
import { DayTimeline } from "../../../components/itinerary/DayTimeline";
import { TransportSection } from "../../../components/itinerary/TransportSection";
import { BudgetBreakdown } from "../../../components/itinerary/BudgetBreakdown";
import { JourneySummary } from "../../../components/itinerary/JourneySummary";
import { SeasonalNote } from "../../../components/itinerary/SeasonalNote";
import { StayDiningRecommendations } from "../../../components/itinerary/StayDiningRecommendations";
import { WeatherPanel } from "../../../components/itinerary/WeatherPanel";
import { getLocale } from "next-intl/server";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Shared itinerary",
  robots: { index: false, follow: false },
};
export default async function SharedItineraryPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[a-zA-Z0-9_-]{32,128}$/.test(token)) notFound();
  const vi = (await getLocale()) === "vi";
  let plan;
  try {
    plan = (await getSharedItinerary(token)).itineraries[0];
  } catch (error) {
    if (error instanceof ApiRequestError && [400, 404].includes(error.status))
      notFound();
    throw error;
  }
  if (!plan) notFound();
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <p className="rounded-xl bg-primary/10 p-3 text-sm text-primary">
        {vi
          ? "Lịch trình được chia sẻ · Chỉ xem"
          : "Shared itinerary · Read only"}
      </p>
      <OverviewCard itinerary={plan} />
      <JourneySummary plan={plan} />
      <WeatherPanel plan={plan} />
      {plan.seasonal_notes && <SeasonalNote notes={plan.seasonal_notes} />}
      <TransportSection segments={plan.transport_summary ?? []} />
      <DayTimeline days={plan.days} currency={plan.currency} />
      <StayDiningRecommendations itinerary={plan} />
      {plan.budget_breakdown && (
        <BudgetBreakdown breakdown={plan.budget_breakdown} />
      )}
    </main>
  );
}
