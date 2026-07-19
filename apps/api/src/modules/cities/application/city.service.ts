import { cacheGet, cacheSet, TTL } from "../../../db/redis.js";
import { cityStore, type CityRecord } from "../../../db/city-store.js";
import { notFound, ok, type ServiceResult } from "../../../shared/application/service-result.js";

export class CityService {
  async search(q: string): Promise<CityRecord[]> {
    if (!q || q.length < 2) return [];

    const cacheKey = `cities:search:${q.toLowerCase()}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return cached as CityRecord[];

    const results = await cityStore.search(q, 10);
    await cacheSet(cacheKey, results, TTL.CITY_METADATA);
    return results;
  }

  async popular(): Promise<CityRecord[]> {
    const cacheKey = "cities:popular";
    const cached = await cacheGet(cacheKey);
    if (cached) return cached as CityRecord[];

    const results = await cityStore.popular(12);
    await cacheSet(cacheKey, results, TTL.CITY_METADATA);
    return results;
  }

  async getDetail(slug: string): Promise<ServiceResult<CityRecord>> {
    const cacheKey = `city:${slug}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return ok(cached as CityRecord);

    const city = await cityStore.findBySlug(slug);
    if (!city) return notFound("City not found");

    await cacheSet(cacheKey, city, TTL.CITY_METADATA);
    return ok(city);
  }
}

export const cityService = new CityService();
