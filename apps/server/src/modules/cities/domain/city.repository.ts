import type { City, CityPlanningData } from "./city.entity.js";

export const CITY_REPOSITORY = Symbol("CITY_REPOSITORY");

export interface CityRepository {
  search(query: string): Promise<City[]>;
  routeCities(values: string[]): Promise<Map<string, City>>;
  byCountry(country: string): Promise<City[]>;
  popular(): Promise<City[]>;
  findBySlug(slug: string): Promise<City | null>;
  findForPlanning(value: string): Promise<CityPlanningData | null>;
  remember(name: string): Promise<City>;
}
