"use client";

import type { Itinerary } from "@travel/types";
import { BudgetBreakdown } from "../itinerary/BudgetBreakdown";
import { DayTimeline } from "../itinerary/DayTimeline";
import { OverviewCard } from "../itinerary/OverviewCard";

type Props = {
  plan: Itinerary | null;
  loading: boolean;
  canEdit: boolean;
  hasScheduleActivities: boolean;
  importing: boolean;
  onImportToSchedule: () => void;
  onOpenSchedule: () => void;
};

export function SavedAiPlanPanel({
  plan,
  loading,
  canEdit,
  hasScheduleActivities,
  importing,
  onImportToSchedule,
  onOpenSchedule,
}: Props) {
  if (loading) {
    return (
      <section className="rounded-3xl border border-outline-variant/30 bg-surface p-6 shadow-sm" data-testid="web-saved-ai-plan-loading">
        <p className="text-sm font-bold text-on-surface">Loading saved AI plan...</p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-container-high">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
        </div>
      </section>
    );
  }

  if (!plan) {
    return (
      <section className="rounded-3xl border border-outline-variant/30 bg-surface p-6 shadow-sm" data-testid="web-saved-ai-plan-empty">
        <p className="text-xs font-extrabold uppercase tracking-widest text-primary">Saved AI plan</p>
        <h2 className="mt-2 font-headline text-2xl font-black">No source plan attached</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-on-surface-variant">
          This trip does not have an AI itinerary attached yet. You can continue planning from the Plan screen.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-5" data-testid="web-saved-ai-plan">
      <div className="rounded-3xl border border-primary/20 bg-primary-container/30 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-widest text-primary">Saved AI plan</p>
            <h2 className="mt-2 font-headline text-2xl font-black text-on-surface">Review the original suggestion</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-on-surface-variant">
              This is the original plan saved into this trip. Add it to Schedule to turn each suggested activity into an editable shared entry for the group, then follow completion from the edited schedule.
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={hasScheduleActivities ? onOpenSchedule : onImportToSchedule}
              disabled={importing}
              className="rounded-full bg-primary px-5 py-3 text-sm font-bold text-on-primary shadow-md"
              data-testid="web-saved-ai-plan-edit"
            >
              {importing
                ? "Adding plan to Schedule..."
                : hasScheduleActivities
                  ? "Edit itinerary"
                  : "Start editing itinerary"}
            </button>
          )}
        </div>
      </div>

      <OverviewCard itinerary={plan} />
      <DayTimeline
        days={plan.days}
        currency={plan.currency}
        onEdit={hasScheduleActivities ? onOpenSchedule : onImportToSchedule}
        editDisabled={importing}
      />
      {plan.budget_breakdown && <BudgetBreakdown breakdown={plan.budget_breakdown} />}
    </section>
  );
}
