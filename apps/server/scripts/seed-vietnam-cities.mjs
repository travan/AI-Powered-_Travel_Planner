import pg from "pg";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "../../..");
const envPath = resolve(projectRoot, ".env");
if (existsSync(envPath) && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(envPath);
}

const { Client } = pg;
const postgresUrls = unique([
  process.env.POSTGRES_URL,
  process.env.DATABASE_URL,
  ...splitCsv(process.env.POSTGRES_URLS),
  ...splitCsv(process.env.DATABASE_URLS),
]);

if (postgresUrls.length === 0) {
  console.error("POSTGRES_URL, DATABASE_URL, POSTGRES_URLS, or DATABASE_URLS is required before seeding Vietnam cities.");
  process.exit(1);
}

const scraperSources = {
  transport: ["google_maps", "rome2rio", "traveloka"],
  tickets: ["klook", "getyourguide", "traveloka"],
  places: "google_places",
};

const cities = [
  city("ha-noi", "Hanoi", "Hà Nội", 21.0278, 105.8342, true, "northern-vietnam", ["capital", "culture", "history", "food", "city-break"], ["Ha Noi", "Hà Nội", "Thủ đô"]),
  city("ho-chi-minh-city", "Ho Chi Minh City", "Thành phố Hồ Chí Minh", 10.7769, 106.7009, true, "southern-vietnam", ["city-break", "food", "nightlife", "history", "business"], ["Saigon", "Sài Gòn", "TP.HCM", "HCMC"]),
  city("da-nang", "Da Nang", "Đà Nẵng", 16.0544, 108.2022, true, "central-vietnam", ["beach", "city-break", "family", "food", "nature"], ["Danang", "Đà Nẵng"]),
  city("hoi-an", "Hoi An", "Hội An", 15.8801, 108.338, true, "central-vietnam", ["heritage", "culture", "food", "romantic", "walking"], ["Hoi An Ancient Town", "Phố cổ Hội An"]),
  city("hue", "Hue", "Huế", 16.4637, 107.5909, true, "central-vietnam", ["heritage", "culture", "history", "food", "river"], ["Imperial City Hue", "Cố đô Huế"]),
  city("nha-trang", "Nha Trang", "Nha Trang", 12.2388, 109.1967, true, "south-central-coast", ["beach", "island", "diving", "family", "seafood"], ["Khanh Hoa", "Khánh Hòa"]),
  city("da-lat", "Da Lat", "Đà Lạt", 11.9404, 108.4583, true, "central-highlands", ["mountain", "romantic", "nature", "coffee", "cool-weather"], ["Dalat", "Đà Lạt"]),
  city("phu-quoc", "Phu Quoc", "Phú Quốc", 10.2899, 103.984, true, "southern-vietnam", ["island", "beach", "resort", "seafood", "family"], ["Phu Quoc Island", "Đảo Phú Quốc"]),
  city("sa-pa", "Sa Pa", "Sa Pa", 22.3364, 103.8438, true, "northern-vietnam", ["mountain", "trekking", "culture", "rice-terraces", "nature"], ["Sapa", "Sa Pa"]),
  city("ha-long", "Ha Long", "Hạ Long", 20.9712, 107.0448, true, "northern-vietnam", ["bay", "cruise", "nature", "island", "family"], ["Ha Long Bay", "Vịnh Hạ Long"]),
  city("ninh-binh", "Ninh Binh", "Ninh Bình", 20.2506, 105.9745, true, "northern-vietnam", ["nature", "heritage", "boat", "karst", "culture"], ["Trang An", "Tràng An", "Tam Cốc"]),
  city("ha-giang", "Ha Giang", "Hà Giang", 22.8026, 104.9784, true, "northern-vietnam", ["mountain", "motorbike", "adventure", "culture", "nature"], ["Dong Van", "Đồng Văn", "Mã Pì Lèng"]),
  city("can-tho", "Can Tho", "Cần Thơ", 10.0452, 105.7469, true, "mekong-delta", ["mekong", "river", "food", "floating-market", "culture"], ["Cai Rang", "Cái Răng"]),
  city("phong-nha", "Phong Nha", "Phong Nha", 17.6103, 106.3145, true, "central-vietnam", ["cave", "adventure", "nature", "national-park", "trekking"], ["Phong Nha-Ke Bang", "Phong Nha Kẻ Bàng", "Quang Binh"]),
  city("quy-nhon", "Quy Nhon", "Quy Nhơn", 13.782, 109.219, true, "south-central-coast", ["beach", "seafood", "heritage", "relax", "coast"], ["Binh Dinh", "Bình Định"]),
  city("mui-ne", "Mui Ne", "Mũi Né", 10.9333, 108.2833, true, "south-central-coast", ["beach", "sand-dunes", "kitesurfing", "seafood", "sunset"], ["Phan Thiet", "Phan Thiết", "Mũi Né"]),
  city("vung-tau", "Vung Tau", "Vũng Tàu", 10.4114, 107.1362, true, "southern-vietnam", ["beach", "weekend", "seafood", "city-break", "family"], ["Ba Ria Vung Tau", "Bà Rịa Vũng Tàu"]),
  city("hai-phong", "Hai Phong", "Hải Phòng", 20.8449, 106.6881, false, "northern-vietnam", ["port-city", "food", "gateway", "city-break", "coast"], ["Hải Phòng"]),
  city("cat-ba", "Cat Ba", "Cát Bà", 20.7278, 107.0482, false, "northern-vietnam", ["island", "beach", "national-park", "kayaking", "nature"], ["Cat Ba Island", "Đảo Cát Bà"]),
  city("mai-chau", "Mai Chau", "Mai Châu", 20.6628, 105.0825, false, "northern-vietnam", ["mountain", "culture", "homestay", "cycling", "rice-fields"], ["Mai Châu"]),
  city("moc-chau", "Moc Chau", "Mộc Châu", 20.8297, 104.728, false, "northern-vietnam", ["mountain", "tea-hills", "flowers", "nature", "cool-weather"], ["Mộc Châu"]),
  city("tam-dao", "Tam Dao", "Tam Đảo", 21.4568, 105.6431, false, "northern-vietnam", ["mountain", "weekend", "cool-weather", "nature", "relax"], ["Tam Đảo"]),
  city("cao-bang", "Cao Bang", "Cao Bằng", 22.6666, 106.2639, false, "northern-vietnam", ["waterfall", "mountain", "nature", "culture", "adventure"], ["Ban Gioc", "Bản Giốc"]),
  city("dien-bien-phu", "Dien Bien Phu", "Điện Biên Phủ", 21.386, 103.023, false, "northern-vietnam", ["history", "mountain", "culture", "museum", "heritage"], ["Dien Bien", "Điện Biên"]),
  city("bac-ha", "Bac Ha", "Bắc Hà", 22.5431, 104.2907, false, "northern-vietnam", ["market", "mountain", "culture", "ethnic-villages", "weekend"], ["Bắc Hà"]),
  city("thanh-hoa", "Thanh Hoa", "Thanh Hóa", 19.8067, 105.7852, false, "north-central-coast", ["beach", "history", "food", "family", "weekend"], ["Sam Son", "Sầm Sơn"]),
  city("vinh", "Vinh", "Vinh", 18.6796, 105.6813, false, "north-central-coast", ["city-break", "history", "food", "gateway", "culture"], ["Nghe An", "Nghệ An"]),
  city("dong-hoi", "Dong Hoi", "Đồng Hới", 17.4689, 106.6223, false, "central-vietnam", ["beach", "cave-gateway", "seafood", "relax", "nature"], ["Quang Binh", "Quảng Bình"]),
  city("tuy-hoa", "Tuy Hoa", "Tuy Hòa", 13.0955, 109.3209, false, "south-central-coast", ["beach", "coast", "seafood", "sunrise", "relax"], ["Phu Yen", "Phú Yên"]),
  city("cam-ranh", "Cam Ranh", "Cam Ranh", 11.9214, 109.1591, false, "south-central-coast", ["beach", "resort", "airport-gateway", "seafood", "family"], ["Cam Ranh Bay", "Vịnh Cam Ranh"]),
  city("con-dao", "Con Dao", "Côn Đảo", 8.6864, 106.6082, false, "southern-vietnam", ["island", "beach", "history", "diving", "nature"], ["Con Son", "Côn Sơn"]),
  city("buon-ma-thuot", "Buon Ma Thuot", "Buôn Ma Thuột", 12.6662, 108.0382, false, "central-highlands", ["coffee", "waterfall", "culture", "nature", "highlands"], ["Dak Lak", "Đắk Lắk"]),
  city("pleiku", "Pleiku", "Pleiku", 13.9833, 108.0, false, "central-highlands", ["highlands", "coffee", "nature", "culture", "lake"], ["Gia Lai", "Biển Hồ"]),
  city("kon-tum", "Kon Tum", "Kon Tum", 14.3545, 108.0076, false, "central-highlands", ["culture", "highlands", "architecture", "nature", "history"], ["Kon Tum Wooden Church", "Nhà thờ gỗ Kon Tum"]),
  city("tay-ninh", "Tay Ninh", "Tây Ninh", 11.3352, 106.1099, false, "southern-vietnam", ["mountain", "temple", "culture", "day-trip", "food"], ["Ba Den Mountain", "Núi Bà Đen"]),
  city("my-tho", "My Tho", "Mỹ Tho", 10.3601, 106.3596, false, "mekong-delta", ["mekong", "river", "day-trip", "food", "boat"], ["Tien Giang", "Tiền Giang"]),
  city("ben-tre", "Ben Tre", "Bến Tre", 10.2434, 106.3756, false, "mekong-delta", ["mekong", "coconut", "river", "cycling", "homestay"], ["Bến Tre"]),
  city("chau-doc", "Chau Doc", "Châu Đốc", 10.7008, 105.1167, false, "mekong-delta", ["river", "temple", "culture", "food", "border"], ["Sam Mountain", "Núi Sam"]),
  city("long-xuyen", "Long Xuyen", "Long Xuyên", 10.3864, 105.4352, false, "mekong-delta", ["mekong", "food", "floating-market", "river", "local-life"], ["An Giang", "Long Xuyên"]),
  city("rach-gia", "Rach Gia", "Rạch Giá", 10.0125, 105.0809, false, "mekong-delta", ["coast", "gateway", "seafood", "island-transfer", "local-life"], ["Kien Giang", "Kiên Giang"]),
  city("tra-vinh", "Tra Vinh", "Trà Vinh", 9.9347, 106.3453, false, "mekong-delta", ["culture", "temples", "mekong", "food", "local-life"], ["Trà Vinh"]),
  city("soc-trang", "Soc Trang", "Sóc Trăng", 9.6025, 105.9739, false, "mekong-delta", ["culture", "temples", "food", "mekong", "local-life"], ["Sóc Trăng"]),
  city("bac-lieu", "Bac Lieu", "Bạc Liêu", 9.294, 105.7278, false, "mekong-delta", ["coast", "culture", "food", "history", "wind-farm"], ["Bạc Liêu"]),
  city("ca-mau", "Ca Mau", "Cà Mau", 9.1769, 105.1524, false, "mekong-delta", ["mangrove", "nature", "coast", "food", "southernmost"], ["Dat Mui", "Đất Mũi"]),
];

function city(slug, en, vi, lat, lon, popular, region, tags, aliases) {
  return {
    slug,
    name: { en, vi },
    country: "VN",
    timezone: "Asia/Ho_Chi_Minh",
    currency: "VND",
    lat,
    lon,
    popular,
    region,
    tags,
    aliases,
    scraper_sources: scraperSources,
    updated_at: new Date(),
  };
}

let lastError;
for (const postgresUrl of postgresUrls) {
  try {
    await seedPostgres(postgresUrl);
    process.exit(0);
  } catch (error) {
    lastError = error;
    console.warn("Vietnam city seed failed for one configured PostgreSQL URL, trying next fallback if available.");
  }
}

throw lastError;

async function seedPostgres(postgresUrl) {
  const client = new Client({ connectionString: postgresUrl });

  try {
    await client.connect();

    let upsertedOrUpdated = 0;

    for (const doc of cities) {
      const result = await client.query(
        `insert into cities (
           slug, name, country, timezone, currency, lat, lon, popular,
           cover_image, scraper_sources, region, tags, aliases, search_text, created_at, updated_at
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, null, $9, $10, $11, $12, $13, now(), now())
         on conflict (slug) do update set
           name = excluded.name,
           country = excluded.country,
           timezone = excluded.timezone,
           currency = excluded.currency,
           lat = excluded.lat,
           lon = excluded.lon,
           popular = excluded.popular,
           cover_image = excluded.cover_image,
           scraper_sources = excluded.scraper_sources,
           region = excluded.region,
           tags = excluded.tags,
           aliases = excluded.aliases,
           search_text = excluded.search_text,
           updated_at = now()`,
        [
          doc.slug,
          doc.name,
          doc.country,
          doc.timezone,
          doc.currency,
          doc.lat,
          doc.lon,
          doc.popular,
          doc.scraper_sources,
          doc.region,
          doc.tags,
          doc.aliases,
          buildSearchText(doc),
        ]
      );
      upsertedOrUpdated += result.rowCount ?? 0;
    }

    const total = await client.query("select count(*)::int as count from cities where country = 'VN'");
    console.info(
      JSON.stringify(
        {
          status: "ok",
          database: "postgres",
          seeded: cities.length,
          upserted_or_updated: upsertedOrUpdated,
          vietnam_city_count: total.rows[0]?.count ?? 0,
        },
        null,
        2
      )
    );
  } finally {
    await client.end();
  }
}

function buildSearchText(doc) {
  return [
    doc.slug,
    doc.name.en,
    doc.name.vi,
    doc.region,
    ...(doc.tags ?? []),
    ...(doc.aliases ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function splitCsv(value) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
