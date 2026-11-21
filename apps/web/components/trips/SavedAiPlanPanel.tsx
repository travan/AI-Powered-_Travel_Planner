"use client";
import { localizedPlan } from "@travel/types";
import { useAppLanguage } from "../i18n/LanguageProvider";
import { PlannerFeedbackPanel } from "../itinerary/PlannerFeedbackPanel";
import { WeatherPanel } from "../itinerary/WeatherPanel";
import React, { useState } from "react";
import { TranslationControls } from "../itinerary/TranslationControls";
import { UiText } from "../i18n/UiText";

import { JourneySummary } from "../itinerary/JourneySummary";
import { StayDiningRecommendations } from "../itinerary/StayDiningRecommendations";
import { TransportSection } from "../itinerary/TransportSection";
import { SeasonalNote } from "../itinerary/SeasonalNote";
import type { Itinerary } from "@travel/types";
import { BudgetBreakdown } from "../itinerary/BudgetBreakdown";
import { DayTimeline } from "../itinerary/DayTimeline";
import { OverviewCard } from "../itinerary/OverviewCard";
import type { TripActivity } from "../../lib/workspace-api";
import {
  buildEditedScheduleDays,
  withEditedSchedule,
} from "../../lib/schedule-preview";

type Props = {
  plan: Itinerary | null;
  tripId?: string;
  token?: string;
  scheduleActivities: TripActivity[];
  loading: boolean;
  canEdit: boolean;
  hasScheduleActivities: boolean;
  importing: boolean;
  onImportToSchedule: () => void;
  onOpenSchedule: () => void;
};

export function SavedAiPlanPanel({
  plan,
  tripId,
  token,
  scheduleActivities,
  loading,
  canEdit,
  hasScheduleActivities,
  importing,
  onImportToSchedule,
  onOpenSchedule,
}: Props) {
  const { locale } = useAppLanguage();
  const [translated, setTranslated] = useState<Itinerary | null>(null);
  if (loading) {
    return (
      <section
        className="rounded-3xl border border-outline-variant/30 bg-surface p-6 shadow-sm"
        data-testid="web-saved-ai-plan-loading"
      >
        <p className="text-sm font-bold text-on-surface">
          {" "}
          <UiText id="t84f8b1ded829" fallback="Loading saved AI plan..." />{" "}
        </p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-container-high">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
        </div>
      </section>
    );
  }

  if (!plan) {
    return (
      <section
        className="rounded-3xl border border-outline-variant/30 bg-surface p-6 shadow-sm"
        data-testid="web-saved-ai-plan-empty"
      >
        <p className="text-xs font-extrabold uppercase tracking-widest text-primary">
          {" "}
          <UiText id="t71e52435bb15" fallback="Saved AI plan" />{" "}
        </p>
        <h2 className="mt-2 font-headline text-2xl font-black">
          {" "}
          <UiText id="t2f01fc72eccf" fallback="No source plan attached" />{" "}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-on-surface-variant">
          {" "}
          <UiText
            id="te415f7f96c7a"
            fallback="This trip does not have an AI itinerary attached yet. You can continue planning from the Plan screen."
          />{" "}
        </p>
      </section>
    );
  }

  const hasEditedSchedule =
    scheduleActivities.length > 0 && plan.schema_version !== 2;
  const originalDisplay = hasEditedSchedule
    ? withEditedSchedule(
        plan,
        buildEditedScheduleDays(plan, scheduleActivities),
      )
    : plan;
  const displayPlan = localizedPlan(translated ?? originalDisplay, locale);

  return (
    <section className="space-y-5" data-testid="web-saved-ai-plan">
      {tripId && token && (
        <TranslationControls
          plan={plan}
          path={`trips/${tripId}/planning/translations`}
          token={token}
          onChange={setTranslated}
        />
      )}
      <div className="rounded-3xl border border-primary/20 bg-primary-container/30 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-widest text-primary">
              {hasEditedSchedule ? (
                <UiText id="t5b8123ce22af" fallback="Edited itinerary" />
              ) : (
                <UiText id="t71e52435bb15" fallback="Saved AI plan" />
              )}
            </p>
            <h2 className="mt-2 font-headline text-2xl font-black text-on-surface">
              {hasEditedSchedule ? (
                <UiText
                  id="t94dc369ff837"
                  fallback="Review your updated schedule"
                />
              ) : (
                <UiText
                  id="t6dcf466f5159"
                  fallback="Review the original suggestion"
                />
              )}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-on-surface-variant">
              {hasEditedSchedule ? (
                <UiText
                  id="t744a91fb295b"
                  fallback="This timeline uses the saved Schedule entries, including your edited titles, times, places, and costs."
                />
              ) : (
                <UiText
                  id="t820af91c6b9c"
                  fallback="This is the original plan saved into this trip. Add it to Schedule to turn each suggested activity into an editable shared entry for the group."
                />
              )}
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={
                hasScheduleActivities ? onOpenSchedule : onImportToSchedule
              }
              disabled={importing}
              className="rounded-full bg-primary px-5 py-3 text-sm font-bold text-on-primary shadow-md"
              data-testid="web-saved-ai-plan-edit"
            >
              {importing ? (
                <UiText
                  id="t79a864044d8f"
                  fallback="Adding plan to Schedule..."
                />
              ) : hasScheduleActivities ? (
                <UiText id="tcebda1d6429d" fallback="Edit itinerary" />
              ) : (
                <UiText id="t9ab5cc0a8944" fallback="Start editing itinerary" />
              )}
            </button>
          )}
        </div>
      </div>

      <JourneySummary plan={displayPlan} />
      {tripId && token && (
        <PlannerFeedbackPanel token={token} tripId={tripId} />
      )}
      <WeatherPanel plan={displayPlan} />
      <OverviewCard
        itinerary={displayPlan}
        showBudgetSummary={!hasEditedSchedule}
      />
      {displayPlan.seasonal_notes && (
        <SeasonalNote notes={displayPlan.seasonal_notes} />
      )}
      <TransportSection segments={displayPlan.transport_summary} />
      <DayTimeline
        days={displayPlan.days}
        currency={displayPlan.currency}
        onEdit={hasEditedSchedule ? onOpenSchedule : onImportToSchedule}
        editDisabled={importing}
        showDailyBudget={!hasEditedSchedule}
      />
      <StayDiningRecommendations itinerary={displayPlan} />
      {!hasEditedSchedule && plan.budget_breakdown && (
        <BudgetBreakdown breakdown={displayPlan.budget_breakdown} />
      )}
    </section>
  );
}
