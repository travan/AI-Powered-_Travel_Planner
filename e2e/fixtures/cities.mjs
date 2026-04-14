export const popularCities = [
  {
    slug: "tokyo",
    name: { en: "Tokyo" },
    country: "Japan",
    popular: true,
  },
  {
    slug: "cache-city",
    name: { en: "Cache City" },
    country: "Mockland",
    popular: true,
  },
];

export function findCitySuggestions(query) {
  const value = query.trim().toLowerCase();

  if (!value || value.length < 2) return [];

  return popularCities.filter((city) => {
    const englishName = city.name.en.toLowerCase();
    return city.slug.includes(value) || englishName.includes(value);
  });
}
