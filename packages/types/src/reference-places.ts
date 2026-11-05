/** Reference names/areas only. These sources do not verify trip-date opening hours or prices. */
const directory =
  "https://osaka-info.jp/en/information/to-tourist/news-spot-osakacity/";
const minami = "https://www.japan.travel/en/spot/2207/";
const park = "https://discover.osaka-info.jp/en/spots/nakanoshima-park";
const usj = "https://www.usj.co.jp/company/company_e/news/2025/pdf/0324.pdf";
const groups: [string, string[], string][] = [
  [
    "Minami",
    ["Dotonbori", "Shinsaibashi", "Hozenji Temple", "Amerikamura", "Ura Namba"],
    minami,
  ],
  [
    "Osaka Castle",
    [
      "Osaka Castle Museum",
      "Miraiza Osaka Castle",
      "Joe Terrace Osaka",
      "Osaka Museum of History",
    ],
    directory,
  ],
  [
    "USJ",
    [
      "Universal Studios Japan",
      "Super Nintendo World (USJ)",
      "The Wizarding World of Harry Potter (USJ)",
      "Minion Park (USJ)",
    ],
    usj,
  ],
  [
    "Tennoji",
    [
      "Shitennoji",
      "Tennoji Park",
      "Osaka Tennoji Zoo",
      "Abeno Harukas",
      "Abeno Q's Mall",
      "Tsutenkaku Tower",
    ],
    directory,
  ],
  [
    "Bay",
    [
      "Osaka Aquarium Kaiyukan",
      "Tempozan Ferris Wheel",
      "LEGOLAND Discovery Center Osaka",
      "Sakishima CosmoTower Observatory",
    ],
    directory,
  ],
  [
    "Kita",
    [
      "Osaka Station City",
      "Grand Front Osaka",
      "HEP FIVE",
      "Whity Umeda",
      "Diamor Osaka",
      "Umeda Sky Building",
      "Kids Plaza Osaka",
      "Osaka Museum of Housing and Living",
    ],
    directory,
  ],
  [
    "Nakanoshima",
    [
      "Osaka City Central Public Hall",
      "The National Museum of Art, Osaka",
      "The Museum of Oriental Ceramics, Osaka",
      "Tekijuku",
    ],
    directory,
  ],
  ["Nakanoshima", ["Nakanoshima Park"], park],
  [
    "Minami",
    [
      "Namba Parks",
      "Crysta Nagahori",
      "National Bunraku Theatre",
      "Namba Grand Kagetsu",
      "Osaka Shochikuza",
    ],
    directory,
  ],
];
export function referencePlaces(city: string) {
  if (!["osaka", "大阪"].includes(city.trim().toLowerCase())) return [];
  return groups.flatMap(([area, names, source_url]) =>
    names.map((name) => ({
      name,
      area,
      tags: [area],
      source: "official_reference",
      source_url,
      last_verified_at: "2026-11-04",
      type: "attraction",
      note: "Name and area supported by the linked tourism reference. Trip-date access, hours and prices need separate confirmation.",
    })),
  );
}
