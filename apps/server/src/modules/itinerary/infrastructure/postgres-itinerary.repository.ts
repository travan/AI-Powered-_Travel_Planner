import { Inject, Injectable } from "@nestjs/common";
import { SQL_CLIENT, type SqlClient } from "../../../database/database.tokens.js";
import type { ItineraryDetail } from "../domain/itinerary.entity.js";
import type { ItineraryRepository } from "../domain/itinerary.repository.js";

type ItineraryRow = {
  id: string;
  user_id: string | null;
  title: string | null;
  status: string;
  cities: string[] | null;
  num_days: number | null;
  budget: string | number | null;
  currency: string | null;
  trip_style: string | null;
  is_public: boolean | null;
  created_at: string;
  result: Record<string, unknown> | null;
};

@Injectable()
export class PostgresItineraryRepository implements ItineraryRepository {
  constructor(@Inject(SQL_CLIENT) private readonly sql: SqlClient) {}

  async findVisible(input: { itineraryId: string; userId?: string | null }): Promise<ItineraryDetail | null> {
    const result = await this.sql.query<ItineraryRow>(
      `select i.id::text,
              i.user_id::text,
              coalesce(i.title, to_jsonb(i)->'result'->>'title', to_jsonb(i)->'output'->>'title') as title,
              i.status,
              i.cities,
              i.num_days,
              i.budget,
              coalesce(i.currency, 'VND') as currency,
              i.trip_style,
              coalesce(i.is_public, false) as is_public,
              i.created_at::text,
              coalesce(to_jsonb(i)->'result', to_jsonb(i)->'output') as result
       from itineraries i
       where i.id = $1
         and (coalesce(i.is_public, false) = true or i.user_id = $2)
       limit 1`,
      [input.itineraryId, input.userId ?? null]
    );
    return result.rows[0] ? mapItinerary(result.rows[0]) : null;
  }
}

function mapItinerary(row: ItineraryRow): ItineraryDetail {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    status: row.status,
    cities: row.cities ?? [],
    numDays: row.num_days,
    budget: row.budget === null ? null : Number(row.budget),
    currency: row.currency ?? "VND",
    tripStyle: row.trip_style,
    isPublic: row.is_public ?? false,
    createdAt: row.created_at,
    result: row.result,
  };
}
