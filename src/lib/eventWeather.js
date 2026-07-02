// Weather forecasts for upcoming calendar events, using two free no-key APIs:
// Nominatim (OpenStreetMap) to geocode the event address once, and Open-Meteo
// for the daily forecast. Both results are cached in localStorage — coordinates
// indefinitely per address, forecasts per calendar day — so a page of events
// costs at most one geocode + one forecast call per unique location per day.

const GEOCODE_CACHE_PREFIX = 'miqra_geocode:';
const FORECAST_CACHE_PREFIX = 'miqra_forecast:';
export const FORECAST_WINDOW_DAYS = 14;

// WMO weather interpretation codes → display info.
const WEATHER_CODES = [
  { codes: [0], emoji: '☀️', label: 'Clear' },
  { codes: [1, 2], emoji: '🌤️', label: 'Mostly clear' },
  { codes: [3], emoji: '☁️', label: 'Overcast' },
  { codes: [45, 48], emoji: '🌫️', label: 'Fog' },
  { codes: [51, 53, 55, 56, 57], emoji: '🌦️', label: 'Drizzle' },
  { codes: [61, 63, 65, 66, 67, 80, 81, 82], emoji: '🌧️', label: 'Rain' },
  { codes: [71, 73, 75, 77, 85, 86], emoji: '🌨️', label: 'Snow' },
  { codes: [95, 96, 99], emoji: '⛈️', label: 'Thunderstorm' },
];

export function describeWeatherCode(code) {
  const entry = WEATHER_CODES.find((w) => w.codes.includes(code));
  return entry ? { emoji: entry.emoji, label: entry.label } : { emoji: '🌡️', label: 'Weather' };
}

// Forecast only makes sense for events from today through the forecast horizon.
export function isForecastable(dateStr, now = new Date()) {
  if (!dateStr) return false;
  const [y, m, d] = String(dateStr).split('-').map(Number);
  if (!y || !m || !d) return false;
  const eventDay = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + FORECAST_WINDOW_DAYS);
  return eventDay >= today && eventDay <= horizon;
}

function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Cache is best-effort; a full localStorage should never break the page.
  }
}

async function geocode(query) {
  const cacheKey = `${GEOCODE_CACHE_PREFIX}${query.toLowerCase()}`;
  const cached = readCache(cacheKey);
  if (cached) return cached.notFound ? null : cached;

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('q', query);
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  const results = await res.json();
  const hit = results?.[0];
  if (!hit) {
    writeCache(cacheKey, { notFound: true });
    return null;
  }
  const coords = { lat: Number(hit.lat), lon: Number(hit.lon) };
  writeCache(cacheKey, coords);
  return coords;
}

async function fetchForecast(coords, dateStr) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(coords.lat));
  url.searchParams.set('longitude', String(coords.lon));
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max');
  url.searchParams.set('temperature_unit', 'fahrenheit');
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('start_date', dateStr);
  url.searchParams.set('end_date', dateStr);
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const daily = data?.daily;
  if (!daily?.time?.length) return null;
  return {
    code: daily.weather_code?.[0],
    high: Math.round(daily.temperature_2m_max?.[0]),
    low: Math.round(daily.temperature_2m_min?.[0]),
    precipChance: daily.precipitation_probability_max?.[0] ?? null,
  };
}

// Fetch (or read cached) forecast for an event. Returns
// { emoji, label, high, low, precipChance } or null when unavailable.
export async function getEventForecast(ev) {
  const place = ev.address || ev.location;
  if (!place || !isForecastable(ev.date)) return null;

  const cacheKey = `${FORECAST_CACHE_PREFIX}${new Date().toDateString()}:${ev.date}:${place.toLowerCase()}`;
  const cached = readCache(cacheKey);
  if (cached) return cached.unavailable ? null : cached;

  try {
    const coords = await geocode(place);
    if (!coords) {
      writeCache(cacheKey, { unavailable: true });
      return null;
    }
    const forecast = await fetchForecast(coords, ev.date);
    if (!forecast || typeof forecast.code !== 'number') {
      writeCache(cacheKey, { unavailable: true });
      return null;
    }
    const { emoji, label } = describeWeatherCode(forecast.code);
    const result = { emoji, label, high: forecast.high, low: forecast.low, precipChance: forecast.precipChance };
    writeCache(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}
