import { Inject, Injectable } from "@nestjs/common";
import {
  SQL_CLIENT,
  type SqlClient,
} from "../../../database/database.tokens.js";
import type { ItineraryDetail } from "../domain/itinerary.entity.js";
import type { ItineraryRepository } from "../domain/itinerary.repository.js";
import type { Itinerary, ItineraryInput, AiTokenUsage } from "@travel/types";

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

  async findReusable(input: {
    userId: string;
    cacheKey: string;
  }): Promise<{ id: string; result: Itinerary } | null> {
    const found = await this.sql.query<{ id: string; result: Itinerary }>(
      `select id::text, result
       from itineraries
       where user_id = $1
         and status = 'complete'
         and result->>'generation_cache_key' = $2
         and created_at >= now() - interval '7 days'
       order by created_at desc
       limit 1`,
      [input.userId, input.cacheKey],
    );
    const row = found.rows[0];
    return row && Array.isArray(row.result?.days) && row.result.days.length > 0
      ? row
      : null;
  }

  async findVisible(input: {
    itineraryId: string;
    userId?: string | null;
  }): Promise<ItineraryDetail | null> {
    const result = await this.sql.query<ItineraryRow>(
      `select i.id::text,
              i.user_id::text,
              coalesce(to_jsonb(i)->'result'->>'title', to_jsonb(i)->'output'->>'title') as title,
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
      [input.itineraryId, input.userId ?? null],
    );
    return result.rows[0] ? mapItinerary(result.rows[0]) : null;
  }

  async findForTrip(input: {
    tripId: string;
    userId: string;
  }): Promise<ItineraryDetail | null> {
    const result = await this.sql.query<ItineraryRow>(
      `select i.id::text,
              i.user_id::text,
              coalesce(to_jsonb(i)->'result'->>'title', to_jsonb(i)->'output'->>'title') as title,
              i.status,
              i.cities,
              i.num_days,
              i.budget,
              coalesce(i.currency, 'VND') as currency,
              i.trip_style,
              coalesce(i.is_public, false) as is_public,
              i.created_at::text,
              coalesce(to_jsonb(i)->'result', to_jsonb(i)->'output') as result
       from trips t
       join trip_members tm
         on tm.trip_id = t.id
        and tm.user_id = $2
        and tm.status = 'active'
       join itineraries i on i.id = t.source_itinerary_id
       where t.id = $1
       limit 1`,
      [input.tripId, input.userId],
    );
    return result.rows[0] ? mapItinerary(result.rows[0]) : null;
  }

  async createComplete(input: {
    userId: string;
    request: ItineraryInput;
    result: Itinerary;
    catalogCities: Array<{ slug: string; name: string }>;
  }): Promise<string> {
    const saved = await this.sql.query<{ id: string }>(
      `with saved as (
         insert into itineraries (
           user_id, cities, countries, start_date, end_date, num_days,
           budget, currency, trip_style, status, result
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'complete', $10)
         returning id
       ),
       queued as (
         insert into city_catalog_ingestion_jobs (itinerary_id, payload)
         select saved.id, jsonb_build_object('cities', $11::jsonb)
         from saved
         returning itinerary_id
       )
       select saved.id::text
       from saved
       inner join queued on queued.itinerary_id = saved.id`,
      [
        input.userId,
        input.request.cities,
        [],
        input.request.start_date ?? null,
        input.request.end_date ?? null,
        input.request.num_days ?? input.result.num_days,
        input.request.budget ?? null,
        input.request.currency,
        input.request.trip_style,
        input.result,
        JSON.stringify(input.catalogCities),
      ],
    );
    return saved.rows[0]!.id;
  }

  async recordFailure(input: {
    userId: string;
    request: ItineraryInput;
    provider: string;
    code: string;
    message: string;
    usage?: AiTokenUsage[];
  }): Promise<void> {
    await this.sql.query(
      `insert into itineraries
       (user_id, cities, start_date, end_date, num_days, budget, currency, trip_style, status, result)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'failed', $9)`,
      [
        input.userId,
        input.request.cities,
        input.request.start_date ?? null,
        input.request.end_date ?? null,
        input.request.num_days ?? null,
        input.request.budget ?? null,
        input.request.currency,
        input.request.trip_style,
        {
          error: {
            provider: input.provider,
            code: input.code,
            message: input.message.slice(0, 4000),
          },
          ...(input.usage?.length ? { ai_usage: input.usage } : {}),
        },
      ],
    );
  }

  async saveAsTrip(input: {
    itineraryId: string;
    userId: string;
  }): Promise<{ tripId: string } | null> {
    const saved = await this.sql.query<{ trip_id: string }>(
      `with source as (
         select i.id,
                i.cities,
                i.start_date,
                i.end_date,
                i.budget,
                coalesce(i.currency, 'USD') as currency,
                coalesce(i.result, '{}'::jsonb) as result
         from itineraries i
         where i.id = $1
           and i.user_id = $2
           and i.status = 'complete'
         limit 1
       ),
       saved_itinerary as (
         insert into saved_trips (user_id, itinerary_id)
         select $2, source.id
         from source
         on conflict (user_id, itinerary_id) do nothing
         returning itinerary_id
       ),
       existing_trip as (
         select t.id
         from trips t
         join source on source.id = t.source_itinerary_id
         where t.owner_user_id = $2::uuid
         order by t.created_at desc
         limit 1
       ),
       created_trip as (
         insert into trips (
           owner_user_id,
           title,
           description,
           primary_city_slug,
           start_date,
           end_date,
           status,
           visibility,
           budget,
           currency,
           source_itinerary_id
         )
         select $2::uuid,
                coalesce(nullif(source.result->>'title', ''), 'Saved trip'),
                nullif(source.result->>'summary', ''),
                case
                  when exists (
                    select 1
                    from cities c
                    where c.slug = source.cities[1]
                  ) then source.cities[1]
                  else null
                end,
                source.start_date,
                source.end_date,
                'planning',
                'private',
                source.budget,
                source.currency,
                source.id
         from source
         where not exists (select 1 from existing_trip)
         returning id
       ),
       selected_trip as (
         select id from created_trip
         union all
         select id from existing_trip
         limit 1
       ),
       host_member as (
         insert into trip_members (trip_id, user_id, role, status, joined_at)
         select selected_trip.id, $2::uuid, 'host', 'active', now()
         from selected_trip
         on conflict (trip_id, user_id)
         do update set role = 'host', status = 'active', joined_at = coalesce(trip_members.joined_at, now())
         returning trip_id
       )
       select trip_id::text
       from host_member
       limit 1`,
      [input.itineraryId, input.userId],
    );
    return saved.rows[0] ? { tripId: saved.rows[0].trip_id } : null;
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
