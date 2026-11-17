import type { ItineraryInput } from "@travel/types";
import * as types from "@travel/types";
const { countryDestinationReference, countryReference } =
  (types as unknown as { default?: typeof types }).default ?? types;

export type ResolvedDestination = {
  id: string;
  city?: string;
  country?: string;
};

/** IDs remain machine keys; names and destination kinds are explicit model context. */
export function destinationContext(
  input: ItineraryInput,
  resolved: ResolvedDestination[] = [],
) {
  return input.cities.map((id) => {
    const chosen = resolved.find((entry) => entry.id === id);
    const country = countryDestinationReference(id);
    const region =
      country ??
      (chosen?.country
        ? (countryDestinationReference(
            `country-${chosen.country.toLowerCase()}`,
          ) ?? countryReference(chosen.country))
        : null);
    return {
      id,
      kind: country ? "country" : "city",
      country_code: region?.country ?? chosen?.country,
      country_name: region?.names.en,
      country_name_local: region?.names[input.locale === "vi" ? "vi" : "en"],
      city:
        country &&
        country.country !== "SG" &&
        [country.names.en, country.names.vi].some(
          (name) => name.toLowerCase() === chosen?.city?.toLowerCase(),
        )
          ? undefined
          : (chosen?.city ?? (country ? undefined : id.replace(/-/g, " "))),
      instruction: country
        ? `Choose a concrete city within ${country.names.en}; never use the country name as a city. Preserve this destination ID and the selected route order.`
        : "Use this city; preserve its destination ID and route order.",
    };
  });
}
