import { ObjectId } from "mongodb";
import type { Job } from "bullmq";
import type { ItineraryInput } from "@travel/types";
import { getDb } from "../db/mongodb.js";
import type { PromptAnalysisJobData } from "../lib/queue.js";
import { buildPromptCluster } from "../lib/prompt-clusters.js";

type PromptEventDocument = {
  _id: ObjectId;
  user_id: string;
  cache_key: string;
  cities: string[];
  city_names: string[];
  input: Partial<ItineraryInput>;
  raw_prompt_text: string;
  itinerary_id: string | null;
};

export async function processPromptAnalysis(job: Job<PromptAnalysisJobData>): Promise<void> {
  const objectId = toObjectId(job.data.promptEventId);
  if (!objectId) return;

  const db = await getDb();
  const prompts = db.collection<PromptEventDocument>("prompt_text_events");
  const promptEvent = await prompts.findOne({ _id: objectId });
  if (!promptEvent) return;

  try {
    const promptCluster = buildPromptCluster({
      cities: promptEvent.cities,
      cityNames: promptEvent.city_names,
      input: {
        start_date: promptEvent.input.start_date,
        num_days: promptEvent.input.num_days,
        budget: promptEvent.input.budget,
        currency: promptEvent.input.currency ?? "USD",
        trip_style: promptEvent.input.trip_style ?? "mixed",
        locale: promptEvent.input.locale ?? "en",
        num_travelers: promptEvent.input.num_travelers ?? 2,
      },
    });
    const now = new Date();

    await prompts.updateOne(
      { _id: objectId },
      {
        $set: {
          cluster_key: promptCluster.cluster_key,
          prompt_cluster: promptCluster,
          analysis_status: "analyzed",
          analyzed_at: now,
          updated_at: now,
        },
        $unset: {
          analysis_error: "",
        },
      }
    );

    await db.collection("prompt_search_clusters").updateOne(
      { cluster_key: promptCluster.cluster_key },
      {
        $set: {
          ...promptCluster,
          sample_input: promptEvent.input,
          sample_raw_prompt_text: promptEvent.raw_prompt_text,
          last_used_at: now,
        },
        $setOnInsert: {
          created_at: now,
        },
        $addToSet: {
          cache_keys: promptEvent.cache_key,
          user_ids: promptEvent.user_id,
        },
        $inc: {
          request_count: 1,
        },
      },
      { upsert: true }
    );
  } catch (error) {
    await prompts.updateOne(
      { _id: objectId },
      {
        $set: {
          analysis_status: "failed",
          analysis_error: error instanceof Error ? error.message : "Unknown prompt analysis error",
          updated_at: new Date(),
        },
      }
    );
    throw error;
  }
}

function toObjectId(value: string): ObjectId | null {
  if (!ObjectId.isValid(value)) return null;
  return new ObjectId(value);
}
