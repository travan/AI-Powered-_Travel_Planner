"use client";
import { localizedPlan } from "@travel/types";
import { useAppLanguage } from "../i18n/LanguageProvider";
import { PlannerLearningPanel } from "./PlannerLearningPanel";
import { WeatherPanel } from "./WeatherPanel";
import React, { useState } from "react";
import type { Itinerary } from "@travel/types";
import { TranslationControls } from "./TranslationControls";
import { OverviewCard } from "./OverviewCard";
import { JourneySummary } from "./JourneySummary";
import { SeasonalNote } from "./SeasonalNote";
import { TransportSection } from "./TransportSection";
import { DayTimeline } from "./DayTimeline";
import { StayDiningRecommendations } from "./StayDiningRecommendations";
import { BudgetBreakdown } from "./BudgetBreakdown";
export function ItineraryContents({
  plan,
  sourceId,
  token,
}: {
  plan: Itinerary;
  sourceId: string;
  token: string;
}) {
  const [translation, setTranslation] = useState<Itinerary | null>(null);
  const { locale } = useAppLanguage();
  const display = localizedPlan(translation ?? plan, locale);
  return (
    <>
      <TranslationControls
        plan={plan}
        path={`itinerary/${sourceId}/translations`}
        token={token}
        onChange={setTranslation}
      />
      <PlannerLearningPanel plan={display} token={token} itineraryId={sourceId} />
      <WeatherPanel plan={display} />
      <OverviewCard itinerary={display} />
      <JourneySummary plan={display} />
      {display.seasonal_notes && (
        <SeasonalNote notes={display.seasonal_notes} />
      )}
      <TransportSection segments={display.transport_summary} />
      <DayTimeline days={display.days} currency={display.currency} />
      <StayDiningRecommendations itinerary={display} />
      {display.budget_breakdown && (
        <BudgetBreakdown breakdown={display.budget_breakdown} />
      )}
    </>
  );
}
