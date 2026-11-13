import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import * as travelTypes from "@travel/types";
import {
  SQL_CLIENT,
  type SqlClient,
} from "../../../database/database.tokens.js";
import type {
  City,
  CityActivity,
  CityPlace,
  CityPlanningData,
} from "../domain/city.entity.js";
import type { CityRepository } from "../domain/city.repository.js";

type CityRow = {
  slug: string;
  name: Record<string, string>;
  country: string;
  timezone: string;
  currency: string;
  lat: number | null;
  lon: number | null;
  popular: boolean;
};

type CityPlaceRow = CityPlace;
type CityActivityRow = CityActivity;

// tsx exposes this CommonJS workspace package through default; bundlers use named exports.
const { slugifyCityName } =
  (travelTypes as unknown as { default?: typeof travelTypes }).default ??
  travelTypes;

@Injectable()
export class PostgresCityRepository implements CityRepository {
  constructor(@Inject(SQL_CLIENT) private readonly sql: SqlClient) {}

  async search(query: string): Promise<City[]> {
    const result = await this.sql.query<CityRow>(
      `select slug, name, country, timezone, currency, lat, lon, popular
       from cities candidate
       where (lookup_keys @> array[$2]::text[] or slug ilike $1
          or search_text ilike $1
          or name::text ilike $1)
         and (candidate.country<>'' and candidate.lat is not null and candidate.lon is not null
           or not exists(select 1 from cities canonical where canonical.slug<>candidate.slug
             and canonical.country<>'' and canonical.lat is not null and canonical.lon is not null
             and canonical.lookup_keys && candidate.lookup_keys))
       order by popular desc, slug asc
       limit 20`,
      [`%${query.trim()}%`, normalizeCityInput(query)],
    );
    return result.rows.map(mapCity);
  }

  async routeCities(values: string[]): Promise<Map<string, City>> {
    if (!values.length) return new Map();
    const { rows } = await this.sql.query<CityRow & { input: string }>(
      `select input.value as input, city.*
       from unnest($1::text[], $2::text[]) as input(value, lookup_key)
       cross join lateral (
         select slug, name, country, timezone, currency, lat, lon, popular
         from cities
         where slug=input.value or lookup_keys @> array[input.lookup_key]::text[]
         order by (country<>'' and lat is not null and lon is not null) desc,
                  (slug=input.value) desc, slug
         limit 1
       ) city`,
      [values, values.map(normalizeCityInput)],
    );
    return new Map(rows.map((row) => [row.input, mapCity(row)]));
  }

  async byCountry(country: string): Promise<City[]> {
    const result = await this.sql.query<CityRow>(
      `select slug, name, country, timezone, currency, lat, lon, popular
       from cities where country = $1 and lat is not null and lon is not null
       order by popular desc, slug limit 10`,
      [country],
    );
    return result.rows.map(mapCity);
  }

  async popular(): Promise<City[]> {
    const result = await this.sql.query<CityRow>(
      `select slug, name, country, timezone, currency, lat, lon, popular
       from cities
       where popular = true
       order by slug asc
       limit 24`,
    );
    return result.rows.map(mapCity);
  }

  async findBySlug(slug: string): Promise<City | null> {
    const result = await this.sql.query<CityRow>(
      `select slug, name, country, timezone, currency, lat, lon, popular
       from cities
       where slug = $1
       limit 1`,
      [slug],
    );
    return result.rows[0] ? mapCity(result.rows[0]) : null;
  }

  async findForPlanning(value: string, catalogLimit?: number): Promise<CityPlanningData | null> {
    const result = await this.sql.query<CityRow>(
      `select slug, name, country, timezone, currency, lat, lon, popular
       from cities
       where lookup_keys @> array[$2]::text[] or slug = $1
          or lower(name->>'en') = lower($1)
          or lower(name->>'vi') = lower($1)
          or exists(select 1 from unnest(aliases) alias where lower(alias)=lower($1))
       order by (country<>'' and lat is not null and lon is not null) desc, case when slug = $1 then 0 else 1 end
       limit 1`,
      [value.trim(), normalizeCityInput(value)],
    );
    const row = result.rows[0];
    if (!row) return null;

    const [places, catalogPlaces, activities] = await Promise.all([
      this.sql.query<CityPlaceRow>(
        `select id::text, last_verified_at::text, lat, lon, google_place_id, current_name as name,
                type,
                category,
                normalized_address as address,
                tags,
                price_level::text as price_level,
                average_rating::double precision as rating,
                opening_hours,
                source
         from places
         where city_slug = $1
           and status = 'active'
           and superseded_by_place_id is null
         order by quality_score desc, popularity_score desc, current_name asc
         limit $2`,
        [row.slug, catalogLimit ?? 30],
      ),
      this.sql.query<CityPlaceRow>(
        `select id::text, last_verified_at::text, lat, lon, google_place_id, name,
                case
                  when category='cafe' then 'cafe'
                  when category in ('restaurant','food') then 'restaurant'
                  when category in ('hotel', 'homestay') then 'hotel'
                  else 'attraction'
                end as type,
                category,
                address,
                tags,
                price_level,
                null::double precision as rating,
                '{}'::jsonb as opening_hours,
                source
         from place_catalog
         where city_slug = $1
           and is_outdated = false
         order by quality_score desc, name asc
         limit $2`,
        [row.slug, catalogLimit ?? 30],
      ),
      this.sql.query<CityActivityRow>(
        `select id::text, last_verified_at::text, title,
                category,
                tags,
                estimated_cost::double precision as estimated_cost,
                currency,
               duration_minutes,
               source
         from activity_catalog
         where city_slug = $1 and not is_outdated
         order by quality_score desc, popularity_score desc, title asc
         limit $2`,
        [row.slug, catalogLimit ?? 30],
      ),
    ]);

    return {
      ...mapCity(row),
      places: [...places.rows, ...catalogPlaces.rows].slice(0, catalogLimit ?? 40),
      activities: activities.rows,
    };
  }

  async remember(name: string): Promise<City> {
    const normalizedName = name.trim();
    const existingByName = await this.sql.query<CityRow>(
      `select slug, name, country, timezone, currency, lat, lon, popular
       from cities
       where lookup_keys @> array[$2]::text[] or slug = $1 or lower(name->>'en') = lower($1)
          or lower(name->>'vi') = lower($1)
          or exists(select 1 from unnest(aliases) alias where lower(alias)=lower($1))
       order by case when slug=$1 then 0 when country<>'' and lat is not null and lon is not null then 1 else 2 end, slug asc
       limit 3`,
      [normalizedName, normalizeCityInput(normalizedName)],
    );
    const identified = existingByName.rows.filter(
      (row) => row.country && row.lat != null && row.lon != null,
    );
    const exact = identified.find((row) => row.slug === normalizedName);
    if (exact) return mapCity(exact);
    if (identified.length === 1) return mapCity(identified[0]!);
    throw new BadRequestException({
      code: identified.length > 1 ? "CITY_AMBIGUOUS" : "CITY_UNRESOLVED",
      message:
        "Select a city with its country/region if the name is ambiguous.",
    });
  }
}

function mapCity(row: CityRow): City {
  return {
    slug: row.slug,
    name: row.name,
    country: row.country,
    timezone: row.timezone,
    currency: row.currency,
    lat: row.lat,
    lon: row.lon,
    popular: row.popular,
  };
}

export function normalizeCityInput(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]/g, "");
}
