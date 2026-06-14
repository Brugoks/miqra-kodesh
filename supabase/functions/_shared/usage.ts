type UsageEvent = {
  provider: string;
  feature: string;
  status?: number;
  units?: number;
  organizationId?: string | null;
  userId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function recordUsageEvent(event: UsageEvent) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) return;

  try {
    await fetch(`${supabaseUrl}/rest/v1/api_usage_events`, {
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
        user_id: event.userId ?? null,
        metadata: event.metadata ?? {},
      }),
    });
  } catch {
    // Usage telemetry should never break the user-facing API response.
  }
}
