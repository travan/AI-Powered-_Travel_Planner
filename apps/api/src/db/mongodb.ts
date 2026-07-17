import { MongoClient, type Db } from "mongodb";
import { env } from "../env.js";

let client: MongoClient | null = null;
let db: Db | null = null;
let activeUriIndex = 0;

export async function getDb(): Promise<Db> {
  if (db) return db;

  const uris = getMongoUris();
  let lastError: unknown;

  for (let offset = 0; offset < uris.length; offset += 1) {
    const index = (activeUriIndex + offset) % uris.length;
    const uri = uris[index]!;

    try {
      client = new MongoClient(uri, {
        maxPoolSize: 20,
        serverSelectionTimeoutMS: env.MONGODB_CONNECT_TIMEOUT_MS,
      });

      await client.connect();
      db = client.db(env.MONGODB_DB_NAME);
      await ensureMongoIndexes(db);
      activeUriIndex = index;
      console.info("MongoDB connected");
      return db;
    } catch (error) {
      lastError = error;
      await client?.close().catch(() => undefined);
      client = null;
      db = null;

      if (uris.length > 1) {
        console.warn(`MongoDB connection failed, trying fallback ${offset + 1}/${uris.length - 1}`);
      }
    }
  }

  throw lastError;
}

async function ensureMongoIndexes(database: Db): Promise<void> {
  await database.collection("places").createIndex({ ttl: 1 }, { expireAfterSeconds: 0 });
  await database.collection("cached_responses").createIndex({ ttl: 1 }, { expireAfterSeconds: 0 });

  await database.collection("prompt_text_events").createIndex(
    { expires_at: 1 },
    { expireAfterSeconds: 0 }
  );
  await database.collection("prompt_text_events").createIndex(
    { user_id: 1, created_at: -1 }
  );
  await database.collection("prompt_text_events").createIndex(
    { analysis_status: 1, created_at: 1 }
  );
  await database.collection("prompt_text_events").createIndex(
    { user_id: 1, cache_key: 1 },
    {
      unique: true,
      partialFilterExpression: {
        user_id: { $type: "string" },
        cache_key: { $type: "string" },
      },
    }
  );

  await database.collection("prompt_search_clusters").createIndex(
    { cluster_key: 1 },
    { unique: true }
  );
  await database.collection("prompt_search_clusters").createIndex(
    { city_slugs: 1 }
  );
  await database.collection("prompt_search_clusters").createIndex(
    { intent_tags: 1 }
  );
  await database.collection("prompt_search_clusters").createIndex(
    { trip_style: 1, last_used_at: -1 }
  );

  await database.collection("ocr_raw_documents").createIndex(
    { bill_upload_id: 1 },
    { unique: true }
  );
  await database.collection("ocr_raw_documents").createIndex(
    { status: 1, created_at: 1 }
  );

  await database.collection("ocr_extraction_attempts").createIndex(
    { bill_upload_id: 1, created_at: -1 }
  );

  await database.collection("bill_parse_candidates").createIndex(
    { bill_upload_id: 1, confidence_score: -1 }
  );

  await database.collection("place_normalization_jobs").createIndex(
    { submission_id: 1 },
    { unique: true }
  );
  await database.collection("place_normalization_jobs").createIndex(
    { status: 1, created_at: 1 }
  );

  await database.collection("ai_generation_contexts").createIndex(
    { context_key: 1 },
    { unique: true }
  );
  await database.collection("ai_generation_contexts").createIndex(
    { expires_at: 1 },
    { expireAfterSeconds: 0 }
  );

  await database.collection("ai_response_cache").createIndex(
    { cache_key: 1 },
    { unique: true }
  );
  await database.collection("ai_response_cache").createIndex(
    { expires_at: 1 },
    { expireAfterSeconds: 0 }
  );
}

export async function closeDb(): Promise<void> {
  await client?.close();
  client = null;
  db = null;
  activeUriIndex = 0;
}

function getMongoUris(): string[] {
  const uris = (env.MONGODB_URIS ?? env.MONGODB_URI)
    .split(",")
    .map((uri) => uri.trim())
    .filter(Boolean);

  if (uris.length === 0) {
    throw new Error("MONGODB_URI or MONGODB_URIS is required");
  }

  return uris;
}
