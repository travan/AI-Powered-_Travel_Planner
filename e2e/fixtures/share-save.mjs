import { randomBytes } from "node:crypto";
import { getItineraryById } from "./itineraries.mjs";

const sharedByToken = new Map();
const savedByUser = new Map();

export function saveTripForUser(userId, itineraryId) {
  const existing = savedByUser.get(userId) ?? new Set();
  existing.add(itineraryId);
  savedByUser.set(userId, existing);
}

export function createShareToken(itineraryId) {
  const existing = [...sharedByToken].find(([, id]) => id === itineraryId)?.[0];
  const token = existing ?? randomBytes(32).toString("base64url");
  sharedByToken.set(token, itineraryId);
  return token;
}

export function removeShareToken(itineraryId) {
  for (const [token, id] of sharedByToken.entries()) {
    if (id === itineraryId) {
      sharedByToken.delete(token);
    }
  }
}

export function getSharedItinerary(shareToken) {
  const itineraryId = sharedByToken.get(shareToken);
  if (!itineraryId) return null;
  return getItineraryById(itineraryId);
}
