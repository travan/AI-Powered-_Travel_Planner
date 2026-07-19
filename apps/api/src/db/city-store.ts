import type { CityMetadata } from "@travel/types";
import { env } from "../env.js";
import { query } from "./postgres.js";
import { getDb } from "./mongodb.js";

export type CityRecord = CityMetadata & {
  region?: string;
  tags?: string[];
  aliases?: string[];
};

type CityStore = {
  search(q: string, limit?: number): Promise<CityRecord[]>;
  popular(limit?: number): Promise<CityRecord[]>;
  findBySlug(slug: string): Promise<CityRecord | null>;
  findBySlugOrName(value: string): Promise<CityRecord | null>;
};

const cityProjection = {
  slug: 1,
  name: 1,
  country: 1,
  timezone: 1,
  currency: 1,
  lat: 1,
  lon: 1,
  popular: 1,
  cover_image: 1,
  scraper_sources: 1,
  region: 1,
  tags: 1,
  aliases: 1,
};

const postgresCityStore: CityStore = {
  async search(q, limit = 10) {
    const result = await query<CityRecord>(
      `select slug, name, country, timezone, currency, lat, lon, popular, cover_image, scraper_sources, region, tags, aliases
       from cities
       where search_text ilike '%' || $1 || '%'
       order by popular desc, slug asc
       limit $2`,
      [q.trim(), limit]
    );
    return result.rows;
  },

  async popular(limit = 12) {
    const result = await query<CityRecord>(
      `select slug, name, country, timezone, currency, lat, lon, popular, cover_image, scraper_sources, region, tags, aliases
       from cities
       where popular = true
       order by slug asc
       limit $1`,
      [limit]
    );
    return result.rows;
  },

  async findBySlug(slug) {
    const result = await query<CityRecord>(
      `select slug, name, country, timezone, currency, lat, lon, popular, cover_image, scraper_sources, region, tags, aliases
       from cities
       where slug = $1
       limit 1`,
      [slug]
    );
    return result.rows[0] ?? null;
  },

  async findBySlugOrName(value) {
    const normalized = value.trim();
    const result = await query<CityRecord>(
      `select slug, name, country, timezone, currency, lat, lon, popular, cover_image, scraper_sources, region, tags, aliases
       from cities
       where slug = lower($1)
          or name->>'en' ilike $1
          or name->>'vi' ilike $1
          or $1 = any(aliases)
       limit 1`,
      [normalized]
    );
    return result.rows[0] ?? null;
  },
};

const mongoCityStore: CityStore = {
  async search(q, limit = 10) {
    const db = await getDb();
    return db
      .collection<CityRecord>("cities")
      .find({ $text: { $search: q } }, { projection: cityProjection })
      .limit(limit)
      .toArray();
  },

  async popular(limit = 12) {
    const db = await getDb();
    return db
      .collection<CityRecord>("cities")
      .find({ popular: true }, { projection: cityProjection })
      .limit(limit)
      .toArray();
  },

  async findBySlug(slug) {
    const db = await getDb();
    return db.collection<CityRecord>("cities").findOne({ slug });
  },

  async findBySlugOrName(value) {
    const db = await getDb();
    return db
      .collection<CityRecord>("cities")
      .findOne({ $or: [{ slug: value.toLowerCase() }, { "name.en": new RegExp(value, "i") }] });
  },
};

export const cityStore: CityStore =
  env.DATABASE_PROVIDER === "postgres" ? postgresCityStore : mongoCityStore;
