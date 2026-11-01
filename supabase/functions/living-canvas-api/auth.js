// Accept only claims returned by Supabase getClaims (signature verified), never
// a decoded JWT or browser-supplied identity. No user_metadata is consulted.
export function validCanvasClaims(claims, { issuer, resource, clientIds, now = Date.now() / 1000 }) {
  return Boolean(claims && claims.iss === issuer && typeof claims.exp === 'number' && claims.exp > now
    && typeof claims.sub === 'string' && claims.sub.length > 0 && claims.is_anonymous !== true
    && claims.role === 'authenticated' && claims.canvas_integration === true && clientIds.includes(claims.client_id)
    && (Array.isArray(claims.aud) ? claims.aud : [claims.aud]).includes(resource));
}
