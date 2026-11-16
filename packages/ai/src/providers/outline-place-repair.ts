type Day = { day_number: number; city: string; places: string[] };
const key = (name: string) =>
  name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** Identify exact duplicate positions; the model never needs to rewrite valid days. */
export function duplicateOutlinePlaces(days: Day[]) {
  const seen = new Set<string>();
  return days.flatMap((day, dayIndex) =>
    day.places.flatMap((name, placeIndex) => {
      const normalized = key(name);
      if (seen.has(normalized))
        return [
          {
            id: `day_${day.day_number}_place_${placeIndex + 1}`,
            city: day.city,
            dayIndex,
            placeIndex,
            name,
          },
        ];
      seen.add(normalized);
      return [];
    }),
  );
}
