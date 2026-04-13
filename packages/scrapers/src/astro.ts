import axios from "axios";
import type { SunriseSunset, WeatherForecast } from "@travel/types";

// ─── Sunrise / Sunset (sunrise-sunset.org — free, no key required) ────────────

export async function getSunriseSunset(
  lat: number,
  lon: number,
  date: string // YYYY-MM-DD
): Promise<SunriseSunset> {
  const base =
    process.env["SUNRISE_SUNSET_BASE_URL"] ?? "https://api.sunrise-sunset.org";

  const response = await axios.get(`${base}/json`, {
    params: { lat, lng: lon, date, formatted: 0 },
  });

  const results = (response.data as { results: Record<string, string> }).results;

  const toLocalTime = (utcIso: string, offsetHours: number): string => {
    const d = new Date(utcIso);
    d.setHours(d.getHours() + offsetHours);
    return d.toTimeString().slice(0, 5); // "HH:MM"
  };

  // Approximate offset from UTC — ideally use the city's timezone offset
  const offsetHours = 0;

  return {
    sunrise: toLocalTime(results["sunrise"] ?? "", offsetHours),
    sunset: toLocalTime(results["sunset"] ?? "", offsetHours),
    day_length: results["day_length"] ?? "",
    solar_noon: toLocalTime(results["solar_noon"] ?? "", offsetHours),
    civil_twilight_begin: toLocalTime(results["civil_twilight_begin"] ?? "", offsetHours),
    civil_twilight_end: toLocalTime(results["civil_twilight_end"] ?? "", offsetHours),
  };
}

// ─── Weather Forecast (Open-Meteo — free, no key required) ───────────────────

const WMO_DESCRIPTIONS: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Foggy",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  71: "Slight snowfall",
  73: "Moderate snowfall",
  75: "Heavy snowfall",
  80: "Slight showers",
  81: "Moderate showers",
  82: "Violent showers",
  95: "Thunderstorm",
  99: "Thunderstorm with hail",
};

export async function getWeatherForecast(
  lat: number,
  lon: number,
  startDate: string,
  endDate: string
): Promise<WeatherForecast[]> {
  const base =
    process.env["OPENMETEO_BASE_URL"] ?? "https://api.open-meteo.com/v1";

  const response = await axios.get(`${base}/forecast`, {
    params: {
      latitude: lat,
      longitude: lon,
      daily: [
        "weather_code",
        "temperature_2m_max",
        "temperature_2m_min",
        "precipitation_sum",
      ].join(","),
      start_date: startDate,
      end_date: endDate,
      timezone: "auto",
    },
  });

  const daily = (response.data as { daily: Record<string, unknown[]> }).daily;
  const dates = (daily["time"] as string[]) ?? [];

  return dates.map((date, i) => {
    const code = (daily["weather_code"] as number[])[i] ?? 0;
    return {
      date,
      temperature_max: (daily["temperature_2m_max"] as number[])[i] ?? 0,
      temperature_min: (daily["temperature_2m_min"] as number[])[i] ?? 0,
      precipitation_sum: (daily["precipitation_sum"] as number[])[i] ?? 0,
      weather_code: code,
      weather_description: WMO_DESCRIPTIONS[code] ?? "Unknown",
    };
  });
}

/**
 * Build a human-readable weather summary for a trip.
 */
export function buildWeatherNote(forecasts: WeatherForecast[]): {
  note: string;
  highlights: string[];
  warnings: string[];
} {
  if (forecasts.length === 0) {
    return {
      note: "Weather data is limited for the selected dates.",
      highlights: [],
      warnings: [],
    };
  }

  const avgMax = forecasts.reduce((s, f) => s + f.temperature_max, 0) / forecasts.length;
  const rainyDays = forecasts.filter((f) => f.precipitation_sum > 5).length;

  const highlights: string[] = [];
  const warnings: string[] = [];

  if (rainyDays > forecasts.length / 2) {
    warnings.push(`Rain expected on ${rainyDays} out of ${forecasts.length} days — pack a raincoat`);
  }

  if (avgMax > 35) {
    warnings.push("Extremely hot — stay hydrated and avoid midday sun");
  } else if (avgMax > 28) {
    highlights.push("Warm and sunny weather — great for outdoor activities");
  } else if (avgMax < 15) {
    highlights.push("Cool weather — ideal for hiking and city exploration");
  }

  const rainText = rainyDays > 0 ? `Rain on ${rainyDays} day(s).` : "Mostly dry.";
  const note = `Average high: ${Math.round(avgMax)}°C. ${rainText}`;

  return { note, highlights, warnings };
}
