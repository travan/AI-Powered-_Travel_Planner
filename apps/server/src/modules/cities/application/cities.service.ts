import * as travelTypes from "@travel/types";
import { PlaceLookupService } from "./place-lookup.service.js";
import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  ServiceUnavailableException,
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

const { placeKey, countryReference } =
  (travelTypes as unknown as { default?: typeof travelTypes }).default ??
  travelTypes;
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

  routeCities(values: string[]) {
    return this.cities.routeCities(values);
  }

  countryReference(query: string) {
    return countryReference(query);
  }

  async countrySuggestions(query: string) {
    const country = this.countryReference(query);
    return (
      country && {
        ...country,
        cities: await this.cities.byCountry(country.country),
      }
    );
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
        !(error instanceof BadRequestException) ||
        (error.getResponse() as { code?: string }).code !== "CITY_UNRESOLVED"
      )
        throw error;
      if (!this.lookup)
        throw new ServiceUnavailableException("Location lookup unavailable");
      // External lookups happen only on explicit submission, never on autocomplete.
      let result;
      try {
        result = await this.lookup.cityCandidates(name);
      } catch (upstream) {
        if (
          !(upstream instanceof HttpException) ||
          upstream.getStatus() !== 429
        )
          throw upstream;
        await new Promise((resolve) => setTimeout(resolve, 1100));
        result = await this.lookup.cityCandidates(name);
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

  findForPlanning(value: string, catalogLimit?: number): Promise<CityPlanningData | null> {
    return catalogLimit === undefined ? this.cities.findForPlanning(value) : this.cities.findForPlanning(value, catalogLimit);
  }
}
