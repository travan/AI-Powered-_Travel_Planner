import { ObjectId } from "mongodb";
import type { ItineraryInput } from "@travel/types";
import { promptAnalysisQueue } from "../lib/queue.js";
import { getDb } from "./mongodb.js";

const PROMPT_HISTORY_TTL_DAYS = 90;

export type PromptHistoryRow = {
  id: string;
  cities: string[];
  city_names: string[];
  num_days: number | null;
  budget: number | null;
  currency: string;
  trip_style: string;
  cluster_key: string | null;
  prompt_cluster: unknown;
  raw_prompt_text: string;
  analysis_status: "queued" | "analyzed" | "failed";
  created_at: string;
  itinerary_id: string | null;
};

type PromptEventDocument = {
  _id: ObjectId;
  user_id: string;
  cache_key: string;
  cities: string[];
  city_names: string[];
  input: Partial<ItineraryInput>;
  raw_prompt_text: string;
  num_days: number | null;
  budget: number | null;
  currency: string;
  trip_style: string;
  cluster_key: string | null;
  prompt_cluster: unknown | null;
  analysis_status: "queued" | "analyzed" | "failed";
  analysis_error?: string;
  itinerary_id: string | null;
  created_at: Date;
  updated_at: Date;
  expires_at: Date;
};

export async function getPromptHistory(userId: string, limit: number): Promise<PromptHistoryRow[]> {
  const db = await getDb();
  const rows = await db
    .collection<PromptEventDocument>("prompt_text_events")
    .find({ user_id: userId, expires_at: { $gt: new Date() } })
    .sort({ created_at: -1 })
    .limit(limit)
    .toArray();

  return rows.map((row) => ({
    id: row._id.toString(),
    cities: row.cities,
    city_names: row.city_names,
    num_days: row.num_days,
    budget: row.budget,
    currency: row.currency,
    trip_style: row.trip_style,
    cluster_key: row.cluster_key,
    prompt_cluster: row.prompt_cluster,
    raw_prompt_text: row.raw_prompt_text,
    analysis_status: row.analysis_status,
    created_at: row.created_at.toISOString(),
    itinerary_id: row.itinerary_id,
  }));
}

export async function savePromptHistoryToMongo(params: {
  userId: string | null;
  cacheKey: string;
  cities: string[];
  cityNames: string[];
  input: Record<string, unknown>;
  rawPromptText?: string;
  itineraryId?: string;
}): Promise<string | null> {
  const { userId, cacheKey, cities, cityNames, input, itineraryId } = params;
  if (!userId) return null;

  const db = await getDb();
  const now = new Date();
  const expiresAt = new Date(Date.now() + PROMPT_HISTORY_TTL_DAYS * 24 * 60 * 60 * 1000);
  const normalizedInput = normalizeInput(input);
  const rawPromptText = params.rawPromptText ?? buildPromptText({
    cityNames,
    cities,
    input: normalizedInput,
  });

  const result = await db.collection<PromptEventDocument>("prompt_text_events").updateOne(
    { user_id: userId, cache_key: cacheKey },
    {
      $set: {
        cities,
        city_names: cityNames,
        input: normalizedInput,
        raw_prompt_text: rawPromptText,
        num_days: normalizedInput.num_days ?? null,
        budget: normalizedInput.budget ?? null,
        currency: normalizedInput.currency ?? "USD",
        trip_style: normalizedInput.trip_style ?? "mixed",
        itinerary_id: itineraryId ?? null,
        analysis_status: "queued",
        updated_at: now,
        expires_at: expiresAt,
      },
      $unset: {
        analysis_error: "",
      },
      $setOnInsert: {
        user_id: userId,
        cache_key: cacheKey,
        cluster_key: null,
        prompt_cluster: null,
        created_at: now,
      },
    },
    { upsert: true }
  );

  const promptEventId =
    result.upsertedId?.toString() ??
    (
      await db.collection<PromptEventDocument>("prompt_text_events").findOne(
        { user_id: userId, cache_key: cacheKey },
        { projection: { _id: 1 } }
      )
    )?._id.toString() ??
    null;

  if (promptEventId) {
    await promptAnalysisQueue.add(
      "analyze-prompt",
      { promptEventId },
      { jobId: `prompt-${promptEventId}` }
    );
  }

  return promptEventId;
}

function normalizeInput(input: Record<string, unknown>): Partial<ItineraryInput> {
  return {
    start_date: readString(input.start_date),
    end_date: readString(input.end_date),
    num_days: readNumber(input.num_days),
    budget: readNumber(input.budget),
    currency: readString(input.currency) ?? "USD",
    trip_style: readTripStyle(input.trip_style),
    locale: readString(input.locale) ?? "en",
    num_travelers: readNumber(input.num_travelers) ?? 2,
    cities: Array.isArray(input.cities)
      ? input.cities.filter((city): city is string => typeof city === "string")
      : undefined,
  };
}

function buildPromptText(params: {
  cityNames: string[];
  cities: string[];
  input: Partial<ItineraryInput>;
}): string {
  const destinations = params.cityNames.length > 0 ? params.cityNames : params.cities;
  const parts = [
    `Destinations: ${destinations.join(", ")}`,
    params.input.num_days ? `Duration: ${params.input.num_days} days` : null,
    params.input.budget ? `Budget: ${params.input.budget} ${params.input.currency ?? "USD"}` : null,
    `Style: ${params.input.trip_style ?? "mixed"}`,
    params.input.num_travelers ? `Travelers: ${params.input.num_travelers}` : null,
  ];

  return parts.filter(Boolean).join("; ");
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readTripStyle(value: unknown): ItineraryInput["trip_style"] | undefined {
  const style = readString(value);
  if (!style) return undefined;

  if (["adventure", "relax", "culture", "food", "mixed"].includes(style)) {
    return style as ItineraryInput["trip_style"];
  }

  return "mixed";
}
