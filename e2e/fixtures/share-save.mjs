import { getItineraryById } from "./itineraries.mjs";

const sharedByToken = new Map();
const savedByUser = new Map();

export function saveTripForUser(userId, itineraryId) {
  const existing = savedByUser.get(userId) ?? new Set();
  existing.add(itineraryId);
  savedByUser.set(userId, existing);
}

export function createShareToken(itineraryId) {
  const token = `${itineraryId.slice(0, 8)}-mockshare`;
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
