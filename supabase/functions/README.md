# Supabase Edge Functions

## Required Secrets

```bash
supabase secrets set CANVA_CLIENT_ID=...
supabase secrets set CANVA_CLIENT_SECRET=...
supabase secrets set CONSTANT_CONTACT_CLIENT_ID=...
supabase secrets set CONSTANT_CONTACT_CLIENT_SECRET=...
supabase secrets set PEXELS_API_KEY=...   # pexels-proxy (stock photo search)
supabase secrets set FISH_API_KEY=...     # fish-tts (cloned-voice TTS)
supabase secrets set FISH_VOICE_1_ID=...    # fish-tts voice #1 reference_id
supabase secrets set FISH_VOICE_1_LABEL=... # fish-tts voice #1 display label (optional)
supabase secrets set FISH_VOICE_1_RESTRICTED=1 # fish-tts voice #1 admins/developers only (optional)
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

## Passage Chapter Cache (`bible-proxy`)

ESV lookups are served from a whole-chapter cache in `public.passage_cache`,
keyed `esv:<chapterId>` (e.g. `esv:ROM.8`). Requests are almost always verse
ranges inside a small set of chapters, so the proxy fetches the chapter once and
slices ranges out of it with the same `[n]` markers the client's verse parser
expects. Measured over 90 days of `api_usage_events`, 383 ESV calls covered only
120 distinct chapters — a ~69% reduction in upstream calls, rising over time
because Scripture never changes and there are only 1,189 chapters in total.

- Cache hits are recorded under provider **`esv-cache`**, so the **`esv`** counter
  keeps meaning "calls that actually reached Crossway" and stays valid for quota
  tracking. Hit rate = `esv-cache / (esv + esv-cache)`.
- Cross-chapter passages (e.g. `JHN.1.50-JHN.2.2`) bypass the cache and fetch
  directly. The client expects explicit `[3:16]` markers on every chapter after
  the first, which per-chapter fetches would not reproduce.
- A cache read or write failure never breaks a lookup; it just falls through to
  the upstream fetch.

```bash
supabase secrets set ESV_CACHE_TTL_DAYS=30   # optional, default 30; 0 = never expire
```

The TTL is deliberately conservative. It keeps this a *performance cache* rather
than a stored replica of a licensed text. Raising it (or setting `0`) for ESV is
a licensing decision for Crossway, not a technical one — public domain / CC
translations carry no such restriction.

## Q&R Guest Submissions

`qa-guest` is the only public (account-free) surface in the app. It backs the
`/q/:code` route people reach by scanning a session's QR code, and it needs no
secrets beyond the service-role key Supabase injects automatically.

```bash
supabase functions deploy qa-guest
```

Guests are never given database credentials. The function calls the
`qa_guest_session` / `qa_guest_submit` / `qa_guest_vote` RPCs, which are
explicitly revoked from `anon` and `authenticated` and reachable only with the
service role. Rate limits, length caps, and the session's open/closed and
approval settings are enforced inside those RPCs rather than here, so they hold
even if the function is called directly.

## Berean Review AI Providers

`berean-analysis` uses Gemini for its structured JSON review passes by default. OpenRouter can supplement Gemini as a fallback or become the primary provider without changing the client UI.

Default Gemini setup:

```bash
supabase secrets set GEMINI_API_KEY=...
supabase secrets set BEREAN_GEMINI_MODEL=gemini-2.5-flash-lite
```

OpenRouter fallback setup (Gemini first, OpenRouter if Gemini is busy or unavailable):

```bash
supabase secrets set OPENROUTER_API_KEY=...
supabase secrets set BEREAN_OPENROUTER_MODEL=openrouter/free
```

OpenRouter primary setup:

```bash
supabase secrets set BEREAN_AI_PROVIDER=openrouter
supabase secrets set OPENROUTER_API_KEY=...
supabase secrets set BEREAN_OPENROUTER_MODEL=openrouter/free
```

Paid OpenRouter text models are blocked unless explicitly enabled:

```bash
supabase secrets set OPENROUTER_ALLOW_PAID_MODELS=true
```

Optional tuning:

```bash
supabase secrets set BEREAN_OPENROUTER_FALLBACK_ENABLED=false
supabase secrets set BEREAN_GEMINI_FALLBACK_ENABLED=false
supabase secrets set OPENROUTER_HTTP_REFERER=https://your-app.example
supabase secrets set OPENROUTER_APP_TITLE="Miqra Kodesh"
```

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

## Fish Audio Cloned-Voice TTS (`fish-tts`)

`fish-tts` turns scripture text into speech using your cloned voice (Fish Audio
`s2.1-pro-free`), so the reader's "Read aloud" button narrates in your voice.

- The API key and cloned `reference_id` stay server-side as `FISH_API_KEY` / `FISH_VOICE_ID`;
  the client sends only text and receives MP3 bytes.
- **Cost guardrails** (Fish is billed per character):
  - **Caching:** every synthesized chunk is stored in the private `tts-cache` bucket
    (migration `20260725000000_tts_cache_bucket.sql`), keyed by hash(model:voice:text).
    Scripture is static, so a chapter+voice is paid for once, then served free thereafter.
    Cache hits don't require auth and don't count against the caps.
  - **Per-user daily cap:** `FISH_DAILY_CHAR_LIMIT` (default 20000; 0 disables) — synthesizing
    over budget returns HTTP 429 `{ code: 'daily_limit' }`. Cache misses require a signed-in user.
  - **Global daily cap (optional):** `FISH_GLOBAL_DAILY_CHAR_LIMIT` (0/unset disables) backstops
    the whole credit pool across all users → 429 `{ code: 'capacity' }`.
  - Usage is logged to `api_usage_events` with `units` = characters synthesized (feature `tts`),
    plus zero-unit `tts-cache` / `tts-blocked` rows for observability.
  ```sh
  supabase secrets set FISH_DAILY_CHAR_LIMIT=20000
  supabase secrets set FISH_GLOBAL_DAILY_CHAR_LIMIT=200000   # optional
  ```
- **Restricted voices:** `FISH_VOICE_N_RESTRICTED=1` limits voice *N* to admins and developers
  (role read from `profiles`, failing closed). Those voices are omitted from `GET` for everyone
  else, and a `POST` naming one from a non-privileged caller degrades to the first unrestricted
  voice instead of erroring. The check runs before the cache lookup, so cached restricted audio
  is never served either. Currently set on Rico (`_4_`) and Naomi (`_5_`).
  ```sh
  supabase secrets set FISH_VOICE_4_RESTRICTED=1
  ```
- **`GET`** returns `{ voices: [{id,label,restricted}], limits: {...} }`. The caps are only knowable inside this
  function (they are secrets here), so DevTools reads them from this route to chart usage against the
  real limit instead of a hardcoded guess. The API key is never returned — only `configured: true|false`.
- **DevTools:** the *Fish Audio Narration* panel (Overview) splits paid synthesis from free cache hits
  via the `dev_fish_tts_metrics()` RPC (migration `20260727000000_dev_fish_tts_metrics.sql`). Its daily
  window is UTC midnight, matching this function's cap enforcement, so "characters today" is the exact
  number checked against the caps. The generic per-provider card counts cache hits as calls, so it
  overstates spend on its own — read the panel for cost.
- **Licensing:** the free tier has no SLA and is **not** licensed for production / multi-user
  commercial use. Before enabling "Read aloud" for real end users, move to a **paid Fish Audio
  plan** (Plus or higher) and consider Professional Voice Cloning for a verified, cleanly-licensed clone.
- Deploy: `supabase functions deploy fish-tts` · apply the bucket migration: `supabase db push --linked`
