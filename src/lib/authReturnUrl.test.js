import { expect, it } from 'vitest';
import { authReturnUrl } from './authReturnUrl';

it('preserves only the same-origin authorization request through provider sign-in', () => {
  expect(authReturnUrl(new URL('https://miqra.example/oauth/consent?authorization_id=request-id&redirect=https://evil.example'))).toBe('https://miqra.example/oauth/consent?authorization_id=request-id');
  expect(authReturnUrl(new URL('https://miqra.example/?redirect=https://evil.example'))).toBe('https://miqra.example');
});
it('preserves a canvas deep link through sign-in without accepting arbitrary return URLs', () => {
  const url = 'https://miqra.example/study-canvas?canvas=00000000-0000-4000-8000-000000000001';
  expect(authReturnUrl(new URL(url))).toBe(url);
  expect(authReturnUrl(new URL('https://miqra.example/study-canvas?canvas=invalid'))).toBe('https://miqra.example');
});
