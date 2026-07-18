export type ItinerarySummary = {
  id: string;
  userId: string | null;
  title: string | null;
  status: string;
  cities: string[];
  numDays: number | null;
  budget: number | null;
  currency: string;
  tripStyle: string | null;
  isPublic: boolean;
  createdAt: string;
};

export type ItineraryDetail = ItinerarySummary & {
  result: Record<string, unknown> | null;
};
