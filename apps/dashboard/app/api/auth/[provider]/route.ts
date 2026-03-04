import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import type { IntegrationService } from "@resident-secretary/contracts";
import { resolveAppUrl } from "@/lib/env";
import { removeIntegration } from "@/lib/db";
import { integrationProviders, ensureProviderEnv } from "@/lib/integrations";
import { requireAuthedUser } from "@/lib/supabase-server";

export const runtime = "nodejs";

function parseProvider(value: string): IntegrationService | null {
  const provider = value as IntegrationService;
  if (integrationProviders[provider]) {
    return provider;
  }
  return null;
}

export async function GET(
  request: Request,
  { params }: { params: { provider: string } },
) {
  const provider = parseProvider(params.provider);
  if (!provider) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  }

  let user;
  try {
    user = await requireAuthedUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  if (action === "disconnect") {
    await removeIntegration(user.id, provider);
    return NextResponse.json({ ok: true, provider, disconnected: true });
  }

  const env = ensureProviderEnv(provider);
  if (!env.ready) {
    return NextResponse.json(
      {
        error: "Provider environment is incomplete",
        provider,
        missing_env: env.missing,
      },
      { status: 400 },
    );
  }

  const providerClient = integrationProviders[provider];
  if (!providerClient) {
    return NextResponse.json({ error: "Provider disabled" }, { status: 404 });
  }

  const appUrl = resolveAppUrl(request);
  const state = randomUUID();
  const redirectUri = `${appUrl}/api/auth/callback/${provider}`;
  const authUrl = providerClient.getAuthorizationUrl({ redirectUri, state });

  const response = NextResponse.json({ provider, authorization_url: authUrl });
  response.cookies.set(`oauth_state_${provider}`, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });

  return response;
}



