# Resident Secretary Dashboard v1.0

Resident Secretary is a voice-native AI dashboard built with:

- Frontend: Next.js 14 App Router, Tailwind CSS, Framer Motion, Vapi Web SDK
- Backend: Next.js API Routes, SSE streaming, Gemini 2.0 Flash (Agent A), Claude 3.7 Sonnet (Agent B), ElevenLabs TTS
- Data: Supabase PostgreSQL + Auth

## Monorepo Layout

- `apps/dashboard` - Next.js dashboard app (frontend + backend routes)
- `packages/contracts` - shared Zod contracts and TypeScript types
- `apps/dashboard/supabase/migrations` - SQL schema + RLS policies

## Install

```bash
npm install
```

## Environment Variables

1. Copy root `.env.example` values into `apps/dashboard/.env.local` (or your platform env manager).
2. Ensure the following are present for full production functionality:
   - Supabase: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`
   - Voice/LLMs: `VAPI_PUBLIC_KEY`, `VAPI_SERVER_KEY`, `GOOGLE_AI_API_KEY`, `ANTHROPIC_API_KEY`
   - TTS: `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`
   - OAuth: Google, Slack, Linear, Notion credentials
   - Encryption: `INTEGRATION_ENCRYPTION_KEY` (32-byte base64 or 64-char hex)

## Supabase Setup

1. Create a Supabase project.
2. Run migration SQL from:
   - `apps/dashboard/supabase/migrations/202603010001_resident_secretary_schema.sql`
3. Confirm RLS is enabled and policies are created.
4. In Authentication settings, enable Email/Password and email verification.

## OAuth App Setup

Set callback URLs for each provider:

- Gmail: `http://localhost:3000/api/auth/callback/gmail`
- Google Calendar: `http://localhost:3000/api/auth/callback/calendar`
- YouTube: `http://localhost:3000/api/auth/callback/youtube`
- Slack: `http://localhost:3000/api/auth/callback/slack`
- Linear: `http://localhost:3000/api/auth/callback/linear`
- Notion: `http://localhost:3000/api/auth/callback/notion`

## Run Locally

```bash
npm run dev:dashboard
```

Chrome URL:

- `http://localhost:3000`

## Production Build

```bash
npm run build:dashboard
npm run start:dashboard
```

## Build Artifact

After a successful build:

```bash
npm run artifact:dashboard
```

Output:

- `artifacts/dashboard-build.zip`

## Optional Railway Deployment

1. Create Railway service from repo.
2. Set root/app to `apps/dashboard` or use monorepo config with root scripts.
3. Add all environment variables.
4. Build command: `npm run build:dashboard`
5. Start command: `npm run start:dashboard`

## Security Guarantees Implemented

- Confirmation required before irreversible actions.
- No raw audio stored.
- LLM output is Zod-validated before use.
- Integration tokens are server-side only and encrypted at rest (app-layer encryption before DB write).
- Agent context is limited to last 5 messages.
- Session can be explicitly ended (`"end session"`) to clear memory continuity.

