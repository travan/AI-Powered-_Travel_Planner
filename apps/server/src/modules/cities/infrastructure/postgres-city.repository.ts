import { Inject, Injectable } from "@nestjs/common";
import { SQL_CLIENT, type SqlClient } from "../../../database/database.tokens.js";
import type { City } from "../domain/city.entity.js";
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

@Injectable()
export class PostgresCityRepository implements CityRepository {
  constructor(@Inject(SQL_CLIENT) private readonly sql: SqlClient) {}

  async search(query: string): Promise<City[]> {
    const result = await this.sql.query<CityRow>(
      `select slug, name, country, timezone, currency, lat, lon, popular
       from cities
       where slug ilike $1 or name::text ilike $1
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
