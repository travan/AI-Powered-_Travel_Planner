export type City = {
  slug: string;
  name: Record<string, string>;
  country: string;
  timezone: string;
  currency: string;
  lat: number | null;
  lon: number | null;
  popular: boolean;
};

export type CityPlace = {
  lat?: number | null;
  lon?: number | null;
  google_place_id?: string;
  id?: string;
  last_verified_at?: string;
  name: string;
  type: string;
  category: string | null;
  address: string | null;
  tags: string[];
  price_level: string | null;
  rating: number | null;
  opening_hours: Record<string, string>;
  source: string;
};

export type CityActivity = {
  price?: import("@travel/types").ScopedPrice;
  id?: string;
  last_verified_at?: string;
  title: string;
  category: string | null;
  tags: string[];
  estimated_cost: number | null;
  currency: string;
  duration_minutes: number | null;
  source: string;
};

export type CityPlanningData = City & {
  places: CityPlace[];
  activities: CityActivity[];
};
