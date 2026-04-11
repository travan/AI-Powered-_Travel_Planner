import { MongoClient, type Db } from "mongodb";
import { env } from "../env.js";

let client: MongoClient | null = null;
let db: Db | null = null;

export async function getDb(): Promise<Db> {
  if (db) return db;

  client = new MongoClient(env.MONGODB_URI, {
    maxPoolSize: 20,
    serverSelectionTimeoutMS: 5000,
  });

  await client.connect();
  db = client.db(env.MONGODB_DB_NAME);

  // Ensure TTL indexes exist
  await db.collection("places").createIndex({ ttl: 1 }, { expireAfterSeconds: 0 });
  await db.collection("cached_responses").createIndex({ ttl: 1 }, { expireAfterSeconds: 0 });

  // user_prompt_history: TTL 90 days, queryable by userId + created_at, dedup by cache_key
  await db.collection("user_prompt_history").createIndex(
    { expires_at: 1 },
    { expireAfterSeconds: 0 }
  );
  await db.collection("user_prompt_history").createIndex(
    { user_id: 1, created_at: -1 }
  );
  await db.collection("user_prompt_history").createIndex(
    { cache_key: 1 }
  );

  console.info("MongoDB connected");
  return db;
}

export async function closeDb(): Promise<void> {
  await client?.close();
  client = null;
  db = null;
}
