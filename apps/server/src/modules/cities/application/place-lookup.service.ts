import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  HttpException,
} from "@nestjs/common";
import tzLookup from "tz-lookup";
import {
  SQL_CLIENT,
  type SqlClient,
} from "../../../database/database.tokens.js";
import type { City } from "../domain/city.entity.js";
type Location = {
  osm_type: string;
  osm_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  addresstype?: string;
  namedetails?: Record<string, string>;
  address?: Record<string, string>;
};
@Injectable()
export class PlaceLookupService {
  constructor(@Inject(SQL_CLIENT) private readonly sql: SqlClient) {}
  private async request(query: string, cityOnly = false): Promise<Location[]> {
    if (
      typeof query !== "string" ||
      query.trim().length < 3 ||
      query.length > 160
    )
      throw new BadRequestException("Invalid location query");
    const q = query.trim(),
      key = `nominatim:${cityOnly ? "city:" : "place:"}${q.toLowerCase()}`;
    const cached = await this.sql.query<{ body: Location[] }>(
      "select body from travel_external_cache where cache_key=$1 and expires_at>now()",
      [key],
    );
    if (cached.rows[0]) return cached.rows[0].body;
    const contact =
      process.env.WEATHER_CONTACT_URL || process.env.NEXT_PUBLIC_APP_URL;
    if (!contact)
      throw new ServiceUnavailableException("Location lookup not configured");
    const lease = await this.sql.query(
      `insert into external_service_limits(name,next_allowed_at) values('nominatim',now()+interval '1 second') on conflict(name) do update set next_allowed_at=excluded.next_allowed_at where external_service_limits.next_allowed_at<=now() returning name`,
    );
    if (!lease.rows.length)
      throw new HttpException("Please wait before searching again", 429);
    const params = new URLSearchParams({
      q,
      format: "jsonv2",
      limit: "5",
      addressdetails: "1",
      namedetails: "1",
      "accept-language": "en",
      ...(cityOnly ? { featureType: "city" } : {}),
    });
    let response: Response;
    try {
      response = await fetch(
        `${process.env.NOMINATIM_BASE_URL || "https://nominatim.openstreetmap.org"}/search?${params}`,
        {
          headers: { "User-Agent": `TravelPlanner/1.0 (${contact})` },
          signal: AbortSignal.timeout(5000),
        },
      );
    } catch {
      throw new ServiceUnavailableException("Location lookup unavailable");
    }
    if (!response.ok)
      throw new ServiceUnavailableException("Location lookup unavailable");
    const raw = (await response.json()) as Location[];
    if (!Array.isArray(raw))
      throw new ServiceUnavailableException("Invalid location response");
    const results = raw.filter(
      (r) =>
        ["node", "way", "relation"].includes(r.osm_type) &&
        Number.isSafeInteger(r.osm_id) &&
        typeof r.display_name === "string" &&
        Number.isFinite(Number(r.lat)) &&
        Math.abs(Number(r.lat)) <= 90 &&
        Number.isFinite(Number(r.lon)) &&
        Math.abs(Number(r.lon)) <= 180,
    );
    await this.sql.query(
      `insert into travel_external_cache(cache_key,body,expires_at) values($1,$2,now()+interval '30 days') on conflict(cache_key) do update set body=excluded.body,expires_at=excluded.expires_at`,
      [key, JSON.stringify(results)],
    );
    return results;
  }
  async search(citySlug: string, query: string) {
    const city = await this.sql.query<{
      name: Record<string, string>;
      country: string;
    }>("select name,country from cities where slug=$1", [citySlug]);
    if (!city.rows[0]) throw new BadRequestException("Select a known city");
    const results = await this.request(
      [query, city.rows[0].name.en, city.rows[0].country].join(", "),
    );
    return {
      source: "OpenStreetMap contributors",
      source_url: "https://www.openstreetmap.org/copyright",
      candidates: results.map((r) => ({
        source_id: `${r.osm_type}/${r.osm_id}`,
        address: r.display_name,
        lat: Number(r.lat),
        lon: Number(r.lon),
        city_slug: citySlug,
      })),
    };
  }
  async cityCandidates(query: string) {
    const results = await this.request(query, true);
    return {
      source: "OpenStreetMap contributors",
      source_url: "https://www.openstreetmap.org/copyright",
      candidates: results
        .filter(
          (r) =>
            r.address?.country_code &&
            ["city", "town", "village", "municipality"].includes(
              r.addresstype ?? r.type ?? "",
            ),
        )
        .map((r) => ({
          source_id: `${r.osm_type}/${r.osm_id}`,
          name: r.namedetails?.["name:en"] ?? r.display_name.split(",")[0],
          display_name: r.display_name,
          country: r.address!.country_code!.toUpperCase(),
        })),
    };
  }
  async rememberResolved(query: string, sourceId: string): Promise<City> {
    // Only a previously offered, cached provider result may become a canonical city.
    const key = `nominatim:city:${query.trim().toLowerCase()}`;
    const cached = await this.sql.query<{ body: Location[] }>(
      "select body from travel_external_cache where cache_key=$1 and expires_at>now()",
      [key],
    );
    const location = cached.rows[0]?.body.find(
      (r) =>
        `${r.osm_type}/${r.osm_id}` === sourceId &&
        r.address?.country_code &&
        ["city", "town", "village", "municipality"].includes(
          r.addresstype ?? r.type ?? "",
        ),
    );
    if (!location)
      throw new BadRequestException({
        code: "CITY_UNRESOLVED",
        message: "Search and select a city with its country/region again.",
      });
    const en = (
      location.namedetails?.["name:en"] ??
      location.display_name.split(",")[0] ??
      ""
    ).trim();
    const country = location.address!.country_code!.toUpperCase(),
      lat = Number(location.lat),
      lon = Number(location.lon);
    const existing = await this.sql.query<City>(
      "select slug,name,country,timezone,currency,lat,lon,popular from cities where country=$1 and lower(name->>'en')=lower($2) and abs(lat-$3)<0.3 and abs(lon-$4)<0.3 order by slug limit 1",
      [country, en, lat, lon],
    );
    if (existing.rows[0]) {
      await this.sql.query(
        `update cities set aliases=array(select distinct value from unnest(aliases || $2::text[]) value),name=case when name->>'vi'=name->>'en' and $3::text is not null then jsonb_set(name,'{vi}',to_jsonb($3::text)) else name end where slug=$1`,
        [
          existing.rows[0].slug,
          [query.trim(), en, location.namedetails?.["name:vi"] ?? en],
          location.namedetails?.["name:vi"] ?? null,
        ],
      );
      return {
        ...existing.rows[0],
        name: {
          ...existing.rows[0].name,
          vi:
            location.namedetails?.["name:vi"] ?? existing.rows[0].name.vi ?? en,
        },
      };
    }
    const pending = await this.sql.query<{ slug: string }>(
      "select slug from cities where country='' and (lower(name->>'en')=lower($1) or lower(name->>'vi')=lower($1)) order by slug limit 2",
      [query.trim()],
    );
    const priorSlug =
      pending.rows.length === 1 ? pending.rows[0]!.slug : undefined;
    const slug =
      priorSlug ??
      `${
        en
          .normalize("NFD")
          .replace(/\p{M}/gu, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "city"
      }-${country.toLowerCase()}-${location.osm_type}-${location.osm_id}`;
    const name = { en, vi: location.namedetails?.["name:vi"] ?? en };
    const result = await this.sql.query<City>(
      `insert into cities(slug,name,country,timezone,currency,lat,lon,popular,aliases,search_text)
      values($1,$2,$3,$4,coalesce((select currency from cities where country=$3 and currency<>'' order by popular desc limit 1),''),$5,$6,false,$7,$8)
      on conflict(slug) do update set name=excluded.name,country=excluded.country,timezone=excluded.timezone,currency=excluded.currency,lat=excluded.lat,lon=excluded.lon,aliases=cities.aliases || excluded.aliases,search_text=excluded.search_text returning slug,name,country,timezone,currency,lat,lon,popular`,
      [
        slug,
        name,
        country,
        tzLookup(lat, lon),
        lat,
        lon,
        [query.trim(), en, name.vi],
        `${en} ${name.vi} ${query} ${country}`.toLowerCase(),
      ],
    );
    return result.rows[0]!;
  }
}
