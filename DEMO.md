# Resident Secretary Live Demo

## Open The Demo

- Live app: [https://your-vercel-domain.vercel.app/login](https://your-vercel-domain.vercel.app/login)

Replace `your-vercel-domain` with your deployed Vercel domain before publishing.

## Shared Demo Login

- `DEMO_EMAIL`: `demo@example.com`
- `DEMO_PASSWORD`: `ChangeMeBeforePublishing!`

Use a dedicated Supabase demo project and dedicated demo user.

## 2-Minute Demo Script

1. Open [Live Demo Login](https://your-vercel-domain.vercel.app/login)
2. Sign in with the shared demo credentials.
3. On Home, click **Start Voice** and speak a prompt.
4. Open **Connections** and confirm each service status card state.
5. Ask: “Read my latest emails” and verify a real provider response.

## Required Provider Callback URLs (Hosted)

- `https://your-vercel-domain.vercel.app/api/auth/callback/gmail`
- `https://your-vercel-domain.vercel.app/api/auth/callback/calendar`
- `https://your-vercel-domain.vercel.app/api/auth/callback/youtube`
- `https://your-vercel-domain.vercel.app/api/auth/callback/notion`

## Safety Notes

- Do not send real outbound content from the shared demo account.
- Keep irreversible actions approval-gated (already enforced in app).
- Use non-sensitive demo provider accounts only.

## Demo Ops Runbook

### If integrations show `expired` or `error`

1. Log in as demo user.
2. Go to **Connections**.
3. Disconnect affected integration.
4. Reconnect and complete OAuth.
5. Confirm status returns to `connected`.

### If demo login stops working

1. Reset demo user password in Supabase Auth.
2. Update `DEMO_PASSWORD` in this file.
3. Invalidate old credentials.

### If API keys rotate

1. Update Vercel environment variables.
2. Redeploy.
3. Validate `/api/integrations/status` and one voice action.

## Local Fallback Demo

If the hosted demo is unavailable:

1. `npm install`
2. `npm run dev:dashboard`
3. Open [http://localhost:3000](http://localhost:3000)

