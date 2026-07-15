import { describe, it, expect } from 'vitest';
import { friendlySendError, isNetworkError } from './chatUtils';

describe('isNetworkError', () => {
  it('flags iOS Safari fetch failures (postgrest stringifies the TypeError)', () => {
    expect(isNetworkError({ message: 'TypeError: Load failed' })).toBe(true);
    expect(isNetworkError(new TypeError('Load failed'))).toBe(true);
  });

  it('flags Chrome/Firefox fetch failures', () => {
    expect(isNetworkError({ message: 'Failed to fetch' })).toBe(true);
    expect(isNetworkError({ message: 'NetworkError when attempting to fetch resource.' })).toBe(true);
  });

  it('treats an empty/absent message as a network drop', () => {
    expect(isNetworkError({})).toBe(true);
    expect(isNetworkError(null)).toBe(true);
  });

  it('does not flag real server/validation errors', () => {
    expect(isNetworkError({ message: 'new row violates row-level security policy' })).toBe(false);
    expect(isNetworkError({ message: 'duplicate key value violates unique constraint' })).toBe(false);
  });
});

describe('friendlySendError', () => {
  it('replaces raw network errors with a retryable message', () => {
    expect(friendlySendError({ message: 'TypeError: Load failed' }))
      .toBe('Message didn’t send — check your connection and tap Retry.');
  });

  it('passes real server errors through untouched', () => {
    expect(friendlySendError({ message: 'new row violates row-level security policy' }))
      .toBe('new row violates row-level security policy');
  });
});
