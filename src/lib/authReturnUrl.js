/** Same-origin return routes needed while connecting or opening a canvas. */
export function authReturnUrl(location) {
  const params = new URLSearchParams(location.search);
  const authorizationId = params.get('authorization_id');
  if (location.pathname === '/oauth/consent' && authorizationId && authorizationId.length <= 200) {
    const target = new URL('/oauth/consent', location.origin);
    target.searchParams.set('authorization_id', authorizationId);
    return target.href;
  }
  const canvasId = params.get('canvas');
  if (location.pathname === '/study-canvas' && /^[0-9a-f-]{36}$/i.test(canvasId || '')) {
    return `${location.origin}/study-canvas?canvas=${canvasId}`;
  }
  return location.origin;
}
