# CB Students Portal

React + Vite portal for CB Students small groups, leader tools, announcements, and ministry integrations.

## Local Development

```bash
npm install
npm run dev
```

## Environment

Create a local `.env` from `.env.example` and fill in the values that apply.

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_CANVA_CLIENT_ID=
VITE_CANVA_REDIRECT_URI=http://localhost:5176/?integration=canva
VITE_CONSTANT_CONTACT_CLIENT_ID=
VITE_CONSTANT_CONTACT_REDIRECT_URI=http://localhost:5176/?integration=constant-contact
ESV_API_KEY=
```

Supabase is optional for local development. If the Supabase keys are missing, the app skips auth and uses local storage where supported.
`ESV_API_KEY` is a server-side Supabase Edge Function secret used by the ESV text and audio proxies.

### Cloudflare R2 for generated wiki images

Generated Bible Wiki fallback images can be served from Cloudflare R2 while user/org uploads stay in Supabase Storage. Set `VITE_WIKI_IMAGE_BASE_URL` to the public R2 bucket URL or custom domain. Only `_default/...` wiki image paths use this external base URL; org-specific `wiki_entry_images` still resolve from Supabase.

Migration checklist:

1. Create an R2 bucket, for example `miqra-wiki-images`.
2. Enable public access. Use `r2.dev` for testing, but prefer a custom domain for production.
3. Create an R2 API token with object read/write access to that bucket.
4. Add `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET` to local `.env`.
5. Run `node scripts/migrate-wiki-images-to-r2.js --dry-run`, then run it without `--dry-run`.
6. Set `VITE_WIKI_IMAGE_BASE_URL` in the deployed frontend and rebuild/deploy.
Use of ESV text must follow Crossway's ESV API terms, including non-commercial use, visible ESV attribution, an ESV.org link, and the stated copy/download limits.

## Integrations

The Integrations tab is the starting point for Canva and Constant Contact workflows.

- Canva uses OAuth with PKCE and is prepared for Connect API scopes.
- Constant Contact uses OAuth and is prepared for contact and campaign scopes.
- The current UI can draft announcements, attach a Canva design link, and preview email/text content.

The browser app only stores public client IDs. Token exchange, refresh tokens, and API calls that require secrets should run through a backend or Supabase Edge Functions before sending real campaigns.

## Supabase Backend

Run the migrations in `supabase/migrations` before using the hosted app. The backend schema supports:

- Auth user profiles and the admin user list
- Calendar events and RSVPs
- Leader roster, attendance, feedback, and briefing data
- Prayer wall requests, amens, and private journal entries
- Dashboard announcements and Bible study series
- Announcement drafts for Canva / Constant Contact workflows
- Stored integration connections for Canva and Constant Contact

## Build

```bash
npm run build
```
