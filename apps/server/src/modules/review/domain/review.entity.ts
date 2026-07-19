export type ReviewEntityType = "activity" | "bill" | "expense" | "place_signal";
export type ReviewDecision = "approved" | "rejected";

export type ReviewQueueItem = {
  id: string;
  entityType: ReviewEntityType;
  entityId: string;
  title: string;
  subtitle: string | null;
  status: string;
  submittedByUserId: string | null;
  amount: number | null;
  currency: string | null;
  linkedActivityId: string | null;
  createdAt: string;
};

export type DataQualitySignal = {
  id: string;
  signalType: "price_change" | "duplicate_place" | "renamed_place" | "moved_place" | "outdated_place";
  severity: "low" | "medium" | "high";
  title: string;
  detail: string;
  entityType: string;
  entityId: string | null;
  status: "open" | "reviewed";
};
