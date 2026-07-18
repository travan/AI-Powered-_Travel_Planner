export type ActivityCatalogItem = {
  id: string;
  canonicalName: string;
  category: string;
  citySlug: string | null;
  address: string | null;
  source: string;
  qualityScore: number;
  isOutdated: boolean;
  lastVerifiedAt: string | null;
};

export type TripActivityParticipant = {
  activityId: string;
  userId: string;
  status: "joined" | "declined" | "maybe";
  joinedAt: string;
};

export type TripActivity = {
  id: string;
  tripId: string;
  activityCatalogId: string | null;
  title: string;
  category: string;
  scheduledAt: string | null;
  locationName: string | null;
  address: string | null;
  estimatedCost: number | null;
  currency: string;
  createdByUserId: string;
  updatedByUserId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  participants: TripActivityParticipant[];
};
