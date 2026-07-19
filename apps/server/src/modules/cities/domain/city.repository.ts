import type { City } from "./city.entity.js";

export const CITY_REPOSITORY = Symbol("CITY_REPOSITORY");

export interface CityRepository {
  search(query: string): Promise<City[]>;
  popular(): Promise<City[]>;
  findBySlug(slug: string): Promise<City | null>;
}
