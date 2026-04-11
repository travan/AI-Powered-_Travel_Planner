// Affiliate link builders — no scraping required
// Booking.com, Airbnb, and other OTAs provide affiliate URL structures

const BOOKING_AFFILIATE_ID = process.env["BOOKING_AFFILIATE_ID"] ?? "";

export function buildBookingSearchUrl(
  city: string,
  checkIn: string,
  checkOut: string,
  numAdults = 2
): string {
  const params = new URLSearchParams({
    ss: city,
    checkin: checkIn,
    checkout: checkOut,
    group_adults: String(numAdults),
    aid: BOOKING_AFFILIATE_ID,
  });
  return `https://www.booking.com/searchresults.html?${params.toString()}`;
}

export function buildAirbnbSearchUrl(
  city: string,
  checkIn: string,
  checkOut: string,
  numAdults = 2
): string {
  const params = new URLSearchParams({
    checkin: checkIn,
    checkout: checkOut,
    adults: String(numAdults),
  });
  return `https://www.airbnb.com/s/${encodeURIComponent(city)}/homes?${params.toString()}`;
}

export function buildKlookSearchUrl(
  activityName: string,
  city: string
): string {
  return `https://www.klook.com/search/?query=${encodeURIComponent(`${activityName} ${city}`)}`;
}

export function buildTravelokaActivityUrl(activityName: string): string {
  return `https://www.traveloka.com/en-vn/activities/search?keyword=${encodeURIComponent(activityName)}`;
}

export function buildTripComActivityUrl(activityName: string): string {
  return `https://www.trip.com/travel-guide/attraction/search/?keyword=${encodeURIComponent(activityName)}`;
}

export function buildGetYourGuideUrl(activityName: string, city: string): string {
  return `https://www.getyourguide.com/s/?q=${encodeURIComponent(`${activityName} ${city}`)}`;
}

export function buildViatorUrl(activityName: string, city: string): string {
  return `https://www.viator.com/search/${encodeURIComponent(city)}?text=${encodeURIComponent(activityName)}`;
}

export function buildSkyscannerFlightUrl(
  origin: string,
  destination: string,
  date: string
): string {
  // Format: YYMMDD
  const formattedDate = date.replace(/-/g, "").slice(2);
  return `https://www.skyscanner.com/transport/flights/${origin}/${destination}/${formattedDate}/`;
}
