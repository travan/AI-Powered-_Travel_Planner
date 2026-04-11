import type { FastifyInstance } from "fastify";
import { getDb } from "../../db/mongodb.js";
import { cacheGet, cacheSet, TTL } from "../../db/redis.js";

export async function citiesRoutes(fastify: FastifyInstance) {
  // ── Search (autocomplete) ──────────────────────────────────────────────────
  fastify.get<{ Querystring: { q: string } }>("/cities/search", async (request, reply) => {
    const { q } = request.query as { q: string };
    if (!q || q.length < 2) return reply.send([]);

    const cacheKey = `cities:search:${q.toLowerCase()}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return reply.send(cached);

    const db = await getDb();
    const results = await db
      .collection("cities")
      .find(
        { $text: { $search: q } },
        { projection: { slug: 1, name: 1, country: 1, popular: 1, cover_image: 1 } }
      )
      .limit(10)
      .toArray();

    await cacheSet(cacheKey, results, TTL.CITY_METADATA);
    return reply.send(results);
  });

  // ── Popular cities (for trending/homepage) ─────────────────────────────────
  fastify.get("/cities/popular", async (_request, reply) => {
    const cacheKey = "cities:popular";
    const cached = await cacheGet(cacheKey);
    if (cached) return reply.send(cached);

    const db = await getDb();
    const results = await db
      .collection("cities")
      .find(
        { popular: true },
        { projection: { slug: 1, name: 1, country: 1, popular: 1, cover_image: 1 } }
      )
      .limit(12)
      .toArray();

    await cacheSet(cacheKey, results, TTL.CITY_METADATA);
    return reply.send(results);
  });

  // ── City detail ────────────────────────────────────────────────────────────
  fastify.get<{ Params: { slug: string } }>("/cities/:slug", async (request, reply) => {
    const { slug } = request.params;

    const cacheKey = `city:${slug}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return reply.send(cached);

    const db = await getDb();
    const city = await db.collection("cities").findOne({ slug });

    if (!city) {
      return reply.status(404).send({ statusCode: 404, error: "Not Found", message: "City not found" });
    }

    await cacheSet(cacheKey, city, TTL.CITY_METADATA);
    return reply.send(city);
  });
}
