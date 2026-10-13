import { Inject, Injectable } from "@nestjs/common";
import { slugifyCityName } from "@travel/types";
import { SQL_CLIENT, type SqlClient } from "../../../database/database.tokens.js";
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

@Injectable()
export class PostgresCityRepository implements CityRepository {
  constructor(@Inject(SQL_CLIENT) private readonly sql: SqlClient) {}

  async search(query: string): Promise<City[]> {
    const result = await this.sql.query<CityRow>(
      `select slug, name, country, timezone, currency, lat, lon, popular
       from cities
       where slug ilike $1
          or search_text ilike $1
          or name::text ilike $1
       order by popular desc, slug asc
       limit 20`,
      [`%${query.trim()}%`]
    );
    return result.rows.map(mapCity);
  }

  async popular(): Promise<City[]> {
    const result = await this.sql.query<CityRow>(
      `select slug, name, country, timezone, currency, lat, lon, popular
       from cities
       where popular = true
       order by slug asc
       limit 24`
    );
    return result.rows.map(mapCity);
  }

  async findBySlug(slug: string): Promise<City | null> {
    const result = await this.sql.query<CityRow>(
      `select slug, name, country, timezone, currency, lat, lon, popular
       from cities
       where slug = $1
       limit 1`,
      [slug]
    );
    return result.rows[0] ? mapCity(result.rows[0]) : null;
  }

  async findForPlanning(value: string): Promise<CityPlanningData | null> {
    const result = await this.sql.query<CityRow>(
      `select slug, name, country, timezone, currency, lat, lon, popular
       from cities
       where slug = $1
          or lower(name->>'en') = lower($1)
          or lower(name->>'vi') = lower($1)
       order by case when slug = $1 then 0 else 1 end
       limit 1`,
      [value.trim()]
    );
    const row = result.rows[0];
    if (!row) return null;

    const [places, catalogPlaces, activities] = await Promise.all([
      this.sql.query<CityPlaceRow>(
        `select current_name as name,
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
         limit 30`,
        [row.slug]
      ),
      this.sql.query<CityPlaceRow>(
        `select name,
                case
                  when category in ('restaurant', 'food', 'cafe') then 'restaurant'
                  when category in ('hotel', 'homestay') then 'hotel'
                  else 'attraction'
                end as type,
                category,
                address,
                '{}'::text[] as tags,
                price_level,
                null::double precision as rating,
                '{}'::jsonb as opening_hours,
                source
         from place_catalog
         where city_slug = $1
           and is_outdated = false
         order by quality_score desc, name asc
         limit 30`,
        [row.slug]
      ),
      this.sql.query<CityActivityRow>(
        `select title,
                category,
                tags,
                estimated_cost::double precision as estimated_cost,
                currency,
               duration_minutes,
               source
         from activity_catalog
         where city_slug = $1
         order by quality_score desc, popularity_score desc, title asc
         limit 30`,
        [row.slug]
      ),
    ]);

    return {
      ...mapCity(row),
      places: [...places.rows, ...catalogPlaces.rows].slice(0, 40),
      activities: activities.rows,
    };
  }

  async remember(name: string): Promise<City> {
    const normalizedName = name.trim();
    const existingByName = await this.sql.query<CityRow>(
      `select slug, name, country, timezone, currency, lat, lon, popular
       from cities
       where lower(name->>'en') = lower($1)
          or lower(name->>'vi') = lower($1)
       order by slug asc
       limit 1`,
      [normalizedName]
    );
    if (existingByName.rows[0]) return mapCity(existingByName.rows[0]);

    const slug = slugifyCityName(normalizedName);
    if (!slug) throw new Error("City name must contain letters or numbers");

    await this.sql.query(
      `insert into cities (
         slug, name, country, timezone, currency, lat, lon, popular, search_text
       )
       values ($1, jsonb_build_object('en', $2, 'vi', $2), '', '', '', null, null, false, lower($2))
       on conflict (slug) do nothing`,
      [slug, normalizedName]
    );

    const saved = await this.sql.query<CityRow>(
      `select slug, name, country, timezone, currency, lat, lon, popular
       from cities
       where slug = $1
       limit 1`,
      [slug]
    );
    const row = saved.rows[0];
    if (!row) throw new Error(`City "${normalizedName}" was not saved`);
    return mapCity(row);
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
