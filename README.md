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
```

Supabase is optional for local development. If the Supabase keys are missing, the app skips auth and uses local storage where supported.

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
