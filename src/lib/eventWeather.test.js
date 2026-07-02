import { describe, it, expect } from 'vitest';
import { describeWeatherCode, isForecastable, FORECAST_WINDOW_DAYS } from './eventWeather';

describe('describeWeatherCode', () => {
  it('maps common WMO codes', () => {
    expect(describeWeatherCode(0)).toEqual({ emoji: '☀️', label: 'Clear' });
    expect(describeWeatherCode(63)).toEqual({ emoji: '🌧️', label: 'Rain' });
    expect(describeWeatherCode(95)).toEqual({ emoji: '⛈️', label: 'Thunderstorm' });
  });

  it('falls back for unknown codes', () => {
    expect(describeWeatherCode(999).label).toBe('Weather');
  });
});

describe('isForecastable', () => {
  const now = new Date(2026, 6, 1, 15, 30); // July 1 2026, mid-afternoon

  it('accepts today and near-future dates', () => {
    expect(isForecastable('2026-07-01', now)).toBe(true);
    expect(isForecastable('2026-07-05', now)).toBe(true);
  });

  it('rejects past dates', () => {
    expect(isForecastable('2026-06-30', now)).toBe(false);
  });

  it('rejects dates beyond the forecast window', () => {
    const beyond = new Date(2026, 6, 1 + FORECAST_WINDOW_DAYS + 1);
    const key = `${beyond.getFullYear()}-${String(beyond.getMonth() + 1).padStart(2, '0')}-${String(beyond.getDate()).padStart(2, '0')}`;
    expect(isForecastable(key, now)).toBe(false);
  });

  it('rejects missing or malformed dates', () => {
    expect(isForecastable(null, now)).toBe(false);
    expect(isForecastable('not-a-date', now)).toBe(false);
  });
});
