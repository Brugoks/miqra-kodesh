# Supabase Edge Functions

## Required Secrets

```bash
supabase secrets set CANVA_CLIENT_ID=...
supabase secrets set CANVA_CLIENT_SECRET=...
supabase secrets set CONSTANT_CONTACT_CLIENT_ID=...
supabase secrets set CONSTANT_CONTACT_CLIENT_SECRET=...
```

Supabase automatically provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to deployed Edge Functions.

## Deploy

```bash
supabase functions deploy integrations-oauth
supabase functions deploy integrations-manage
supabase functions deploy integrations-proxy
```

The `integrations-oauth` function exchanges OAuth authorization codes for access tokens and saves them in `public.integration_connections`.
The `integrations-manage` function returns connection metadata and disconnects integrations without exposing stored tokens to the browser.
The `integrations-proxy` function makes read-only provider API calls with stored tokens, such as listing Canva designs or Constant Contact lists.
