import type {
  ItineraryOutput,
  CitySuggestion,
  PromptHistoryEntry,
  GenerateRequest,
  GenerateResponse,
} from "@travel/types";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "";

function getApiUrl(path: string) {
  if (!API_URL) return path;
  return `${API_URL.replace(/\/$/, "")}${path}`;
}

export async function generateItinerary(
  body: GenerateRequest,
  authToken?: string
): Promise<GenerateResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

  const res = await fetch(getApiUrl("/api/itinerary/generate"), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Generate failed: ${res.status}`);
  return res.json() as Promise<GenerateResponse>;
}

export async function getItinerary(id: string): Promise<ItineraryOutput> {
  const res = await fetch(getApiUrl(`/api/itinerary/${id}`), {
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return res.json() as Promise<ItineraryOutput>;
}

export async function searchCities(q: string): Promise<CitySuggestion[]> {
  const res = await fetch(getApiUrl(`/api/cities/search?q=${encodeURIComponent(q)}`));
  if (!res.ok) return [];
  return res.json() as Promise<CitySuggestion[]>;
}

export async function getPopularCities(): Promise<CitySuggestion[]> {
  const res = await fetch(getApiUrl("/api/cities/popular"), {
    next: { revalidate: 86400 }, // 24h client-side revalidation
  });
  if (!res.ok) return [];
  return res.json() as Promise<CitySuggestion[]>;
}

export async function getPromptHistory(
  authToken: string,
  limit = 5
): Promise<PromptHistoryEntry[]> {
  const res = await fetch(getApiUrl(`/api/users/me/prompt-history?limit=${limit}`), {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) return [];
  return res.json() as Promise<PromptHistoryEntry[]>;
}

export async function saveTrip(
  itineraryId: string,
  authToken: string
): Promise<void> {
  const res = await fetch(getApiUrl(`/api/itinerary/${itineraryId}/save`), {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) throw new Error(`Save failed: ${res.status}`);
}

export async function shareItinerary(
  itineraryId: string,
  authToken: string
): Promise<{ share_token: string; share_url: string }> {
  const res = await fetch(getApiUrl(`/api/itinerary/${itineraryId}/share`), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) throw new Error(`Share failed: ${res.status}`);
  return res.json() as Promise<{ share_token: string; share_url: string }>;
}
