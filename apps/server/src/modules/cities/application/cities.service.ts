import { PlaceLookupService } from "./place-lookup.service.js";
import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
} from "@nestjs/common";
import {
  notFound,
  ok,
  type ServiceResult,
} from "../../../shared/application/service-result.js";
import {
  CITY_REPOSITORY,
  type CityRepository,
} from "../domain/city.repository.js";
import type { City, CityPlanningData } from "../domain/city.entity.js";

@Injectable()
export class CitiesService {
  constructor(
    @Inject(CITY_REPOSITORY) private readonly cities: CityRepository,
    @Inject(PlaceLookupService) private readonly lookup?: PlaceLookupService,
  ) {}

  search(query: string): Promise<City[]> {
    if (query.trim().length < 2) return Promise.resolve([]);
    return this.cities.search(query);
  }

  popular(): Promise<City[]> {
    return this.cities.popular();
  }

  async getDetail(slug: string): Promise<ServiceResult<CityPlanningData>> {
    const city = await this.cities.findForPlanning(slug);
    return city ? ok(city) : notFound("City not found");
  }

  async remember(name: string, preferredSlug?: string): Promise<City> {
    if (preferredSlug && preferredSlug !== name) {
      try {
        return await this.cities.remember(preferredSlug);
      } catch (error) {
        if (!(error instanceof BadRequestException)) throw error;
      }
    }
    try {
      return await this.cities.remember(name);
    } catch (error) {
      if (
        !this.lookup ||
        !(error instanceof BadRequestException) ||
        (error.getResponse() as { code?: string }).code !== "CITY_UNRESOLVED"
      )
        throw error;
      // External lookups happen only on explicit submission, never on autocomplete.
      let result;
      try {
        result = await this.lookup.cityCandidates(name);
      } catch (upstream) {
        if (upstream instanceof HttpException && upstream.getStatus() === 503)
          throw error;
        if (
          !(upstream instanceof HttpException) ||
          upstream.getStatus() !== 429
        )
          throw upstream;
        await new Promise((resolve) => setTimeout(resolve, 1100));
        try {
          result = await this.lookup.cityCandidates(name);
        } catch (retry) {
          if (retry instanceof HttpException && retry.getStatus() === 503)
            throw error;
          throw retry;
        }
      }
      if (result.candidates.length !== 1)
        throw new BadRequestException({
          code: result.candidates.length ? "CITY_AMBIGUOUS" : "CITY_UNRESOLVED",
          message:
            "The name needs a city/country choice; no location was guessed.",
          candidates: result.candidates,
        });
      return this.lookup.rememberResolved(
        name,
        result.candidates[0]!.source_id,
      );
    }
  }

  findForPlanning(value: string): Promise<CityPlanningData | null> {
    return this.cities.findForPlanning(value);
  }
}
