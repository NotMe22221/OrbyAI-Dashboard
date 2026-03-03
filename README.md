# Resident Secretary Dashboard v1.0

Resident Secretary is a voice-native AI dashboard built with:

- Frontend: Next.js 14 App Router, Tailwind CSS, Framer Motion, Vapi Web SDK
- Backend: Next.js API Routes, SSE streaming, Gemini 2.0 Flash (Agent A), Claude 3.7 Sonnet (Agent B), ElevenLabs TTS
- Data: Supabase PostgreSQL + Auth

## Live Demo

- Hosted login: [https://your-vercel-domain.vercel.app/login](https://your-vercel-domain.vercel.app/login)
- Full demo guide: [DEMO.md](./DEMO.md)

Replace `your-vercel-domain` with your deployed Vercel domain before sharing publicly.

## Voice Reliability Troubleshooting (Hosted Demo)

- Use Chrome on desktop for the most reliable browser speech recognition.
- Hosted microphone capture requires HTTPS. `http://localhost` is allowed for local development only.
- If voice does not start:
  - Check browser mic permission for the demo domain and allow access.
  - Reload the page after permission changes.
  - Confirm runtime readiness at `/api/voice/health`.
- If you see `Unsupported` mic status:
  - Switch to a browser with Web Speech support (recommended: latest Chrome).

## Monorepo Layout

- `apps/dashboard` - Next.js dashboard app (frontend + backend routes)
- `packages/contracts` - shared Zod contracts and TypeScript types
- `apps/dashboard/supabase/migrations` - SQL schema + RLS policies

## Install

```bash
npm install
```

## Vercel Deployment (Click-to-Test Demo)

1. Create a Vercel project from this repository.
2. Set project root to repository root.
3. Build command:
   - `npm run build:dashboard`
4. Install command:
   - `npm install`
5. Add all required environment variables in Vercel.
6. Set `NEXT_PUBLIC_APP_URL` to your Vercel domain.

### Required Environment Variables (Vercel)

- Supabase:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_KEY`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- LLM/TTS:
  - `GOOGLE_AI_API_KEY`
  - `ELEVENLABS_API_KEY`
  - `ELEVENLABS_VOICE_ID`
- OAuth:
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `NOTION_CLIENT_ID`
  - `NOTION_CLIENT_SECRET`
  - `NOTION_AUTHORIZATION_URL` (optional)
- Security:
  - `INTEGRATION_ENCRYPTION_KEY`
- App base:
  - `NEXT_PUBLIC_APP_URL=https://your-vercel-domain.vercel.app`

## Supabase Setup

1. Create a dedicated Supabase demo project.
2. Run migration SQL from:
   - `apps/dashboard/supabase/migrations/202603010001_resident_secretary_schema.sql`
3. Confirm RLS is enabled and policies are created.
4. Enable Email/Password auth.
5. Create one shared demo user for hosted login testing.

## OAuth App Setup

Set callback URLs for hosted deployment:

- `https://your-vercel-domain.vercel.app/api/auth/callback/gmail`
- `https://your-vercel-domain.vercel.app/api/auth/callback/calendar`
- `https://your-vercel-domain.vercel.app/api/auth/callback/youtube`
- `https://your-vercel-domain.vercel.app/api/auth/callback/notion`

Local callbacks (fallback):

- `http://localhost:3000/api/auth/callback/gmail`
- `http://localhost:3000/api/auth/callback/calendar`
- `http://localhost:3000/api/auth/callback/youtube`
- `http://localhost:3000/api/auth/callback/notion`

## Run Locally

```bash
npm run dev:dashboard
```

Local URL:

- [http://localhost:3000](http://localhost:3000)

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

## Security Guarantees Implemented

- Confirmation required before irreversible actions.
- No raw audio stored.
- LLM output is Zod-validated before use.
- Integration tokens are server-side only and encrypted at rest (app-layer encryption before DB write).
- Agent context is limited to last 5 messages.
- Session can be explicitly ended (`"end session"`) to clear memory continuity.
