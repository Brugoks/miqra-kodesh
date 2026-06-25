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

## Image Generation Fallbacks

`image-proxy` uses Cloudflare Workers AI first. It can fall back to Gemini AI Studio, then OpenRouter's dedicated Images API, for quota, rate-limit, capacity, or provider outage errors.

Fallbacks are opt-in. Gemini image generation is paid-gated because current Gemini image models do not have Free Tier pricing available. To enable Gemini AI Studio image fallback:

```bash
supabase secrets set GEMINI_IMAGE_FALLBACK_ENABLED=true
supabase secrets set GEMINI_API_KEY=...
supabase secrets set GEMINI_IMAGE_MODEL=gemini-3.1-flash-image
supabase secrets set GEMINI_ALLOW_PAID_IMAGE_MODELS=true
```

To enable OpenRouter image fallback:

```bash
supabase secrets set OPENROUTER_IMAGE_FALLBACK_ENABLED=true
supabase secrets set OPENROUTER_API_KEY=...
supabase secrets set OPENROUTER_IMAGE_MODEL=sourceful/riverflow-v2.5-fast
```

Most OpenRouter image models have per-image pricing. The proxy will not call paid image models unless this is set:

```bash
supabase secrets set OPENROUTER_ALLOW_PAID_IMAGE_MODELS=true
```

Optional tuning:

```bash
supabase secrets set IMAGE_FALLBACK_ON_ANY_ERROR=true
supabase secrets set OPENROUTER_HTTP_REFERER=https://your-app.example
supabase secrets set OPENROUTER_APP_TITLE="Miqra Kodesh"
```
