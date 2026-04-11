export interface CityMetadata {
  slug: string;
  name: Record<string, string>; // { en: "Da Nang", vi: "Đà Nẵng" }
  country: string;              // ISO 3166-1 alpha-2: "VN"
  timezone: string;             // IANA: "Asia/Ho_Chi_Minh"
  currency: string;             // ISO 4217: "VND"
  lat: number;
  lon: number;
  popular: boolean;
  cover_image?: string;         // URL for hero/card display (optional, populated via CMS/seeding)
  scraper_sources: {
    transport: string[];
    tickets: string[];
    places: string;
  };
}

export interface Place {
  id?: string;
  city_slug: string;
  type: "attraction" | "restaurant" | "hotel";
  name: string;
  rating?: number;
  price_range?: string;
  address: string;
  lat?: number;
  lon?: number;
  maps_link: string;
  categories: string[];
  opening_hours?: Record<string, string>;
  source: string;
  ttl?: Date;
}

export interface SunriseSunset {
  sunrise: string; // "05:20"
  sunset: string;  // "18:45"
  day_length: string;
  solar_noon: string;
  civil_twilight_begin: string;
  civil_twilight_end: string;
}

export interface WeatherForecast {
  date: string;
  temperature_max: number;
  temperature_min: number;
  precipitation_sum: number;
  weather_code: number;
  weather_description: string;
}
