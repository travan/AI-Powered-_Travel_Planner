import * as travelTypes from "@travel/types";
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

const { placeKey } =
  (travelTypes as unknown as { default?: typeof travelTypes }).default ??
  travelTypes;
const regions = {
  en: new Intl.DisplayNames("en", { type: "region", fallback: "none" }),
  vi: new Intl.DisplayNames("vi", { type: "region", fallback: "none" }),
};
const countries = new Map<string, string>([
  ["russianfederation", "RU"],
  ["lienbangnga", "RU"],
  ["usa", "US"],
  ["uk", "GB"],
]);
for (const code of "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(
  " ",
)) {
  for (const formatter of Object.values(regions)) {
    const name = formatter.of(code);
    if (name) countries.set(placeKey(name), code);
  }
}

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
    const code = countries.get(placeKey(query));
    if (!code) return null;
    return {
      country: code,
      names: {
        en: regions.en.of(code) ?? code,
        vi: regions.vi.of(code) ?? code,
      },
    };
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
