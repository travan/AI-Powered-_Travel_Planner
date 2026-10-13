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
