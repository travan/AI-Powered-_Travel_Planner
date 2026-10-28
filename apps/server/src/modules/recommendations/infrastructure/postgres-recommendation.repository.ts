import { Inject, Injectable } from "@nestjs/common";
import {
  SQL_CLIENT,
  type SqlClient,
} from "../../../database/database.tokens.js";
import type {
  PlaceRecommendation,
  TransportPriceRecommendation,
} from "../domain/recommendation.entity.js";
import type {
  PlaceRecommendationQuery,
  RecommendationRepository,
  TransportPriceRecommendationQuery,
} from "../domain/recommendation.repository.js";

type PlaceRecommendationRow = {
  source?: string;
  tags?: string[];
  estimated_price?: number | null;
  price_currency?: string;
  id: string;
  name: string;
  category: string;
  city_slug: string | null;
  address: string | null;
  price_level: string | null;
  quality_score: string | number | null;
  last_verified_at: string | null;
};

type TransportPriceRecommendationRow = {
  id: string;
  mode: string;
  provider_name: string | null;
  origin_city: string | null;
  destination_city: string | null;
  currency: string;
  min_price: string | number | null;
  median_price: string | number | null;
  best_observed_at: string | null;
};

@Injectable()
export class PostgresRecommendationRepository implements RecommendationRepository {
  constructor(@Inject(SQL_CLIENT) private readonly sql: SqlClient) {}

  async listPlaces(
    query: PlaceRecommendationQuery,
  ): Promise<PlaceRecommendation[]> {
    const result = await this.sql.query<PlaceRecommendationRow>(
      `select id::text, name, category, city_slug, address, price_level, quality_score, last_verified_at::text, source, tags, estimated_price::float8, price_currency
       from place_catalog
       where ($1::text is null or city_slug = $1)
         and ($2::text is null or category = $2)
         and coalesce(is_outdated, false) = false
         and ($4::text is null or name ilike '%'||$4||'%' or address ilike '%'||$4||'%')
         and ($5::numeric is null or (estimated_price <= $5 and price_currency = coalesce($8, 'VND')))
         and ($6::text[] is null or tags @> $6)
         and ($7::boolean is null or $7=false or independent=true)
       order by quality_score desc nulls last, last_verified_at desc nulls last
       limit $3`,
      [
        query.citySlug ?? null,
        query.category ?? null,
        query.limit,
        query.q ?? null,
        query.maxPrice ?? null,
        query.tags
          ? query.tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : null,
        query.independentOnly ?? null,
        query.currency ?? null,
      ],
    );
    return result.rows.map(mapPlace);
  }

  async listTransportPrices(
    query: TransportPriceRecommendationQuery,
  ): Promise<TransportPriceRecommendation[]> {
    const result = await this.sql.query<TransportPriceRecommendationRow>(
      `select id::text, mode, provider_name, origin_city, destination_city, currency,
              min_price, median_price, best_observed_at::text
       from transport_price_insights
       where ($1::text is null or mode = $1)
         and ($2::text is null or origin_city = $2)
         and ($3::text is null or destination_city = $3)
       order by best_observed_at desc nulls last, min_price asc nulls last
       limit $4`,
      [
        query.mode ?? null,
        query.originCity ?? null,
        query.destinationCity ?? null,
        query.limit,
      ],
    );
    return result.rows.map(mapTransportPrice);
  }
}

function mapPlace(row: PlaceRecommendationRow): PlaceRecommendation {
  return {
    id: row.id,
    name: row.name,
    source: row.source,
    tags: row.tags,
    estimatedPrice: row.estimated_price ?? null,
    currency: row.price_currency,
    matchReasons: [
      "Có trong catalog khu vực",
      ...(row.tags ?? []).map((tag) => `Có nhãn: ${tag}`),
      ...(row.last_verified_at
        ? ["Có thời điểm xác minh"]
        : ["Cần xác minh thông tin trước khi đi"]),
    ],
    category: row.category,
    citySlug: row.city_slug,
    address: row.address,
    priceLevel: row.price_level,
    qualityScore: Number(row.quality_score ?? 0),
    lastVerifiedAt: row.last_verified_at,
  };
}

function mapTransportPrice(
  row: TransportPriceRecommendationRow,
): TransportPriceRecommendation {
  return {
    id: row.id,
    mode: row.mode,
    providerName: row.provider_name,
    originCity: row.origin_city,
    destinationCity: row.destination_city,
    currency: row.currency,
    minPrice: row.min_price === null ? null : Number(row.min_price),
    medianPrice: row.median_price === null ? null : Number(row.median_price),
    bestObservedAt: row.best_observed_at,
  };
}
