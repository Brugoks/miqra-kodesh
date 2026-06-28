type UsageEvent = {
  provider: string;
  feature: string;
  status?: number;
  units?: number;
  organizationId?: string | null;
  userId?: string | null;
  metadata?: Record<string, unknown>;
  /** Pass the incoming Request to auto-extract the user from the JWT. */
  request?: Request;
};

/** Pull the Supabase user UUID from the Bearer JWT without a network call. */
export function extractUserIdFromRequest(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
    const payload = JSON.parse(atob(padded));
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function recordUsageEvent(event: UsageEvent) {
  const userId = event.userId ?? (event.request ? extractUserIdFromRequest(event.request) : null);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    console.warn('Usage telemetry skipped: missing Supabase URL or service-role key.');
    return;
  }

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/api_usage_events`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        provider: event.provider,
        feature: event.feature,
        status: event.status ?? null,
        units: event.units ?? 1,
        organization_id: event.organizationId ?? null,
        user_id: userId,
        metadata: event.metadata ?? {},
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.warn(`Usage telemetry insert failed: ${response.status} ${detail.slice(0, 240)}`);
    }
  } catch (error) {
    // Usage telemetry should never break the user-facing API response.
    console.warn('Usage telemetry insert failed:', error);
  }
}
