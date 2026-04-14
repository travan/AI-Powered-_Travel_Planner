function buildItinerary({
  id,
  title,
  city,
  numDays,
  travelers,
  totalCost,
  transportSummary = [],
}) {
  return {
    itineraries: [
      {
        id,
        title,
        overview: `A balanced trip through ${city} with contract-backed mock data for E2E coverage.`,
        total_cost: totalCost,
        currency: "USD",
        num_days: numDays,
        num_travelers: travelers,
        seasonal_notes: {
          travel_month: "2026-04",
          daylight_hours: "~12 hours of daylight",
          sunrise_time: "06:10",
          sunset_time: "18:24",
          weather_note: "Clear enough for contract tests.",
          highlights: ["Golden hour walk", "Compact city routing"],
          warnings: [],
        },
        transport_summary: transportSummary,
        days: Array.from({ length: numDays }, (_, index) => ({
          day_number: index + 1,
          date: `2026-04-${String(index + 14).padStart(2, "0")}`,
          city,
          title: `${city} Highlights`,
          activities: [
            {
              time: "09:00",
              name: `Morning in ${city}`,
              description: "Start with a neighborhood walk and coffee.",
              duration: "2h",
              cost: 0,
              currency: "USD",
              category: "attraction",
              maps_link: "https://maps.google.com",
            },
            {
              time: "13:00",
              name: `${city} lunch stop`,
              description: "A reliable lunch recommendation for the mocked route.",
              duration: "1.5h",
              cost: 30,
              currency: "USD",
              category: "food",
              maps_link: "https://maps.google.com",
            },
          ],
          daily_cost_estimate: Math.round(totalCost / numDays),
        })),
        hotels: [],
        restaurants: [],
        suggestions: [],
        budget_breakdown: {
          accommodation: Math.round(totalCost * 0.35),
          food: Math.round(totalCost * 0.25),
          activities: Math.round(totalCost * 0.2),
          transport: Math.round(totalCost * 0.15),
          contingency: Math.round(totalCost * 0.05),
          total: totalCost,
          currency: "USD",
          per_person: Math.round(totalCost / travelers),
          per_day: Math.round(totalCost / numDays),
        },
      },
    ],
  };
}

export const queuedScenario = {
  jobId: "queued-job-1",
  itineraryId: "queued-trip-1",
  city: "Tokyo",
  itinerary: buildItinerary({
    id: "queued-trip-1",
    title: "Tokyo Discovery",
    city: "Tokyo",
    numDays: 3,
    travelers: 2,
    totalCost: 1500,
    transportSummary: [
      {
        segment: "Airport to Tokyo",
        from: "NRT",
        to: "Tokyo",
        recommended_mode: "train",
        options: [
          {
            provider: "Narita Express",
            type: "train",
            duration: "1h",
            price_range: "$25-$35",
            booking_url: "https://example.com/nex",
          },
        ],
      },
    ],
  }),
};

export const cachedScenario = {
  itineraryId: "cached-trip-1",
  city: "Cache City",
  itinerary: buildItinerary({
    id: "cached-trip-1",
    title: "Cache City Escape",
    city: "Cache City",
    numDays: 2,
    travelers: 2,
    totalCost: 900,
  }),
};

export function getItineraryById(id) {
  if (id === queuedScenario.itineraryId) return queuedScenario.itinerary;
  if (id === cachedScenario.itineraryId) return cachedScenario.itinerary;
  return null;
}

export function getItineraryByJobId(jobId) {
  if (jobId === queuedScenario.jobId) return queuedScenario.itinerary;
  return null;
}
