import { randomUUID } from "node:crypto";
import type { Itinerary, ItineraryInput } from "@travel/types";
import { env } from "../env.js";
import { query } from "./postgres.js";
import { getSupabase } from "./supabase.js";

type StoredItinerary = Record<string, unknown>;

type CreateItineraryInput = {
  userId?: string;
  jobId: string;
  input: ItineraryInput;
  countries: string[];
  numDays: number;
  result: Itinerary;
};

type ShareResult = {
  is_public: boolean;
  share_token: string | null;
};

type ItineraryStore = {
  findById(id: string): Promise<StoredItinerary | null>;
  findByJobId(jobId: string): Promise<StoredItinerary | null>;
  findSharedByToken(shareToken: string): Promise<StoredItinerary | null>;
  create(input: CreateItineraryInput): Promise<string | null>;
  saveTrip(userId: string, itineraryId: string): Promise<void>;
  setPublic(input: { id: string; userId: string; isPublic: boolean }): Promise<ShareResult | null>;
  markFailed(jobId: string): Promise<void>;
};

const postgresItineraryStore: ItineraryStore = {
  async findById(id) {
    const result = await query<StoredItinerary>(
      "select * from itineraries where id = $1 limit 1",
      [id]
    );
    return result.rows[0] ?? null;
  },

  async findByJobId(jobId) {
    const result = await query<StoredItinerary>(
      "select * from itineraries where job_id = $1 limit 1",
      [jobId]
    );
    return result.rows[0] ?? null;
  },

  async findSharedByToken(shareToken) {
    const result = await query<StoredItinerary>(
      "select * from itineraries where share_token = $1 and is_public = true limit 1",
      [shareToken]
    );
    return result.rows[0] ?? null;
  },

  async create({ userId, jobId, input, countries, numDays, result }) {
    const saved = await query<{ id: string }>(
      `insert into itineraries (
        user_id,
        job_id,
        cities,
        countries,
        start_date,
        end_date,
        num_days,
        budget,
        currency,
        trip_style,
        status,
        result
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'complete', $11)
      on conflict (job_id) do update set
        user_id = excluded.user_id,
        cities = excluded.cities,
        countries = excluded.countries,
        start_date = excluded.start_date,
        end_date = excluded.end_date,
        num_days = excluded.num_days,
        budget = excluded.budget,
        currency = excluded.currency,
        trip_style = excluded.trip_style,
        status = 'complete',
        result = excluded.result,
        updated_at = now()
      returning id`,
      [
        userId ?? null,
        jobId,
        input.cities,
        countries,
        input.start_date ?? null,
        input.end_date ?? null,
        numDays,
        input.budget ?? null,
        input.currency,
        input.trip_style,
        result,
      ]
    );

    return saved.rows[0]?.id ?? null;
  },

  async saveTrip(userId, itineraryId) {
    await query(
      `insert into saved_trips (user_id, itinerary_id)
       values ($1, $2)
       on conflict (user_id, itinerary_id) do nothing`,
      [userId, itineraryId]
    );
  },

  async setPublic({ id, userId, isPublic }) {
    const shareToken = isPublic ? `${id.slice(0, 8)}-${randomUUID().slice(0, 8)}` : null;
    const result = await query<ShareResult>(
      `update itineraries
       set is_public = $3, share_token = $4, updated_at = now()
       where id = $1 and user_id = $2
       returning is_public, share_token`,
      [id, userId, isPublic, shareToken]
    );

    return result.rows[0] ?? null;
  },

  async markFailed(jobId) {
    await query(
      "update itineraries set status = 'failed', updated_at = now() where job_id = $1",
      [jobId]
    );
  },
};

const supabaseItineraryStore: ItineraryStore = {
  async findById(id) {
    const { data, error } = await getSupabase()
      .from("itineraries")
      .select("*")
      .eq("id", id)
      .single();

    if (error) return null;
    return data as StoredItinerary | null;
  },

  async findByJobId(jobId) {
    const { data, error } = await getSupabase()
      .from("itineraries")
      .select("*")
      .eq("job_id", jobId)
      .single();

    if (error) return null;
    return data as StoredItinerary | null;
  },

  async findSharedByToken(shareToken) {
    const { data, error } = await getSupabase()
      .from("itineraries")
      .select("*")
      .eq("share_token", shareToken)
      .eq("is_public", true)
      .single();

    if (error) return null;
    return data as StoredItinerary | null;
  },

  async create({ userId, jobId, input, countries, numDays, result }) {
    const { data, error } = await getSupabase()
      .from("itineraries")
      .insert({
        user_id: userId ?? null,
        job_id: jobId,
        cities: input.cities,
        countries,
        start_date: input.start_date,
        end_date: input.end_date,
        num_days: numDays,
        budget: input.budget,
        currency: input.currency,
        trip_style: input.trip_style,
        status: "complete",
        result,
      })
      .select("id")
      .single();

    if (error || !data?.id) return null;
    return data.id as string;
  },

  async saveTrip(userId, itineraryId) {
    const { error } = await getSupabase()
      .from("saved_trips")
      .upsert({ user_id: userId, itinerary_id: itineraryId }, { onConflict: "user_id,itinerary_id" });

    if (error) throw new Error(error.message);
  },

  async setPublic({ id, userId, isPublic }) {
    const shareToken = isPublic
      ? `${id.slice(0, 8)}-${Math.random().toString(36).slice(2, 8)}`
      : null;

    const { data, error } = await getSupabase()
      .from("itineraries")
      .update({ is_public: isPublic, share_token: shareToken })
      .eq("id", id)
      .eq("user_id", userId)
      .select("is_public, share_token")
      .single();

    if (error) return null;
    return data as ShareResult | null;
  },

  async markFailed(jobId) {
    await getSupabase()
      .from("itineraries")
      .update({ status: "failed" })
      .eq("job_id", jobId);
  },
};

export const itineraryStore: ItineraryStore =
  env.DATABASE_PROVIDER === "supabase"
    ? supabaseItineraryStore
    : postgresItineraryStore;
