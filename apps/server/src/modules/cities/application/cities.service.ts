import { Inject, Injectable } from "@nestjs/common";
import { notFound, ok, type ServiceResult } from "../../../shared/application/service-result.js";
import { CITY_REPOSITORY, type CityRepository } from "../domain/city.repository.js";
import type { City } from "../domain/city.entity.js";

@Injectable()
export class CitiesService {
  constructor(@Inject(CITY_REPOSITORY) private readonly cities: CityRepository) {}

  search(query: string): Promise<City[]> {
    if (query.trim().length < 2) return Promise.resolve([]);
    return this.cities.search(query);
  }

  popular(): Promise<City[]> {
    return this.cities.popular();
  }

  async getDetail(slug: string): Promise<ServiceResult<City>> {
    const city = await this.cities.findBySlug(slug);
    return city ? ok(city) : notFound("City not found");
  }
}
