import { NextResponse } from "next/server";
import type { IntegrationService } from "@resident-secretary/contracts";
import { encryptSecret } from "@/lib/crypto";
import { upsertIntegration } from "@/lib/db";
import { resolveAppUrl } from "@/lib/env";
import { integrationProviders } from "@/lib/integrations";
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
  const appUrl = resolveAppUrl(request);
  const provider = parseProvider(params.provider);
  if (!provider) {
    return NextResponse.redirect(`${appUrl}/connections?status=error&reason=unknown_provider`);
  }

  let user;
  try {
    user = await requireAuthedUser();
  } catch {
    return NextResponse.redirect(`${appUrl}/login?next=/connections`);
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      `${appUrl}/connections?provider=${provider}&status=error&reason=${encodeURIComponent(error)}`,
    );
  }

  if (!code) {
    return NextResponse.redirect(`${appUrl}/connections?provider=${provider}&status=error&reason=missing_code`);
  }

  const cookieStore = request.headers.get("cookie") ?? "";
  const stateCookie = cookieStore
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`oauth_state_${provider}=`))
    ?.split("=")[1];

  if (stateCookie && state && stateCookie !== state) {
    return NextResponse.redirect(`${appUrl}/connections?provider=${provider}&status=error&reason=state_mismatch`);
  }

  try {
    const providerClient = integrationProviders[provider];
    if (!providerClient) {
      return NextResponse.redirect(`${appUrl}/connections?provider=${provider}&status=error&reason=provider_disabled`);
    }

    const redirectUri = `${appUrl}/api/auth/callback/${provider}`;
    const token = await providerClient.exchangeCode(code, redirectUri);

    await upsertIntegration({
      userId: user.id,
      service: provider,
      accessToken: encryptSecret(token.accessToken),
      refreshToken: token.refreshToken ? encryptSecret(token.refreshToken) : undefined,
      expiresAt: token.expiresAt,
      accountEmail: token.accountEmail,
    });

    return NextResponse.redirect(`${appUrl}/connections?provider=${provider}&status=connected`);
  } catch (exchangeError) {
    const reason = exchangeError instanceof Error ? exchangeError.message : "oauth_exchange_failed";
    return NextResponse.redirect(
      `${appUrl}/connections?provider=${provider}&status=error&reason=${encodeURIComponent(reason)}`,
    );
  }
}



