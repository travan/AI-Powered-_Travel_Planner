import { beforeEach, describe, expect, it, vi } from 'vitest';
import { searchNearbyPlaces, searchTextPlaces } from '../../../../../packages/scrapers/src/google-places.ts';

const axiosGetMock = vi.hoisted(() => vi.fn());

vi.mock('axios', () => ({
  default: {
    get: axiosGetMock,
  },
  get: axiosGetMock,
}));

const city = {
  slug: 'tokyo',
  name: { en: 'Tokyo' },
  lat: 35.6895,
  lon: 139.6917,
};

describe('google places scraper', () => {
  beforeEach(() => {
    axiosGetMock.mockReset();
    delete process.env.GOOGLE_PLACES_API_KEY;
  });

  it('throws when GOOGLE_PLACES_API_KEY is missing for nearby search', async () => {
    await expect(searchNearbyPlaces(city, 'restaurant')).rejects.toThrow(
      'GOOGLE_PLACES_API_KEY is not set'
    );
  });

  it('maps nearby search results to Place objects', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    axiosGetMock.mockResolvedValue({
      data: {
        results: [
          {
            name: 'Sushi Place',
            rating: 4.8,
            price_level: 3,
            vicinity: 'Shinjuku',
            geometry: { location: { lat: 35.6938, lng: 139.7034 } },
            types: ['restaurant', 'food'],
            opening_hours: { weekday_text: ['Monday: 11:00 AM - 10:00 PM'] },
          },
        ],
      },
    });

    const places = await searchNearbyPlaces(city, 'restaurant', 1);
    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({
      city_slug: 'tokyo',
      type: 'restaurant',
      name: 'Sushi Place',
      rating: 4.8,
      price_range: '$$$',
      address: 'Shinjuku',
      lat: 35.6938,
      lon: 139.7034,
      source: 'google_places',
    });
    expect(places[0].opening_hours).toEqual({ Monday: '11:00 AM - 10:00 PM' });
  });

  it('throws when GOOGLE_PLACES_API_KEY is missing for text search', async () => {
    await expect(searchTextPlaces('park', city)).rejects.toThrow(
      'GOOGLE_PLACES_API_KEY is not set'
    );
  });

  it('maps text search results to Place objects', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    axiosGetMock.mockResolvedValue({
      data: {
        results: [
          {
            name: 'Tokyo Tower',
            rating: 4.7,
            formatted_address: '4 Chome-2-8 Shibakoen, Minato City, Tokyo',
            geometry: { location: { lat: 35.6586, lng: 139.7454 } },
            types: ['tourist_attraction', 'point_of_interest'],
          },
        ],
      },
    });

    const places = await searchTextPlaces('tower', city);
    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({
      city_slug: 'tokyo',
      type: 'attraction',
      name: 'Tokyo Tower',
      rating: 4.7,
      address: '4 Chome-2-8 Shibakoen, Minato City, Tokyo',
      lat: 35.6586,
      lon: 139.7454,
      source: 'google_places',
    });
  });
});
