import { getEnv } from "../env";

async function parseGoogleError(res: Response) {
  const payload = await res.json().catch(() => ({}));
  const errorCode = String(payload?.error ?? "unknown_error");
  const errorDescription = String(payload?.error_description ?? payload?.error?.message ?? "").trim();
  return { errorCode, errorDescription };
}

export async function parseGoogleApiFailure(res: Response) {
  const payload = await res.json().catch(() => ({}));
  const nested = payload?.error ?? {};
  const reason = String(
    nested?.errors?.[0]?.reason ??
    nested?.status ??
    payload?.error_description ??
    "",
  ).trim();
  const message = String(nested?.message ?? payload?.error_description ?? "Google API request failed").trim();

  const lowerReason = reason.toLowerCase();
  const lowerMessage = message.toLowerCase();
  const auth =
    res.status === 401 ||
    lowerReason.includes("autherror") ||
    lowerReason.includes("invalidcredentials") ||
    lowerReason.includes("insufficientpermissions") ||
    lowerMessage.includes("invalid authentication credentials") ||
    lowerMessage.includes("request had invalid authentication credentials") ||
    lowerMessage.includes("insufficient authentication scopes");

  return {
    status: res.status,
    reason,
    message,
    auth,
  };
}

export function buildGoogleAuthUrl(scope: string, redirectUri: string, state: string) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", getEnv("GOOGLE_CLIENT_ID"));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scope);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeGoogleCode(code: string, redirectUri: string) {
  const body = new URLSearchParams({
    code,
    client_id: getEnv("GOOGLE_CLIENT_ID"),
    client_secret: getEnv("GOOGLE_CLIENT_SECRET"),
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const details = await parseGoogleError(res);
    throw new Error(`Google token exchange failed: ${res.status} ${details.errorCode} ${details.errorDescription}`.trim());
  }

  const data = await res.json();
  const expiresAt = data.expires_in
    ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString()
    : undefined;

  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string | undefined,
    expiresAt,
  };
}

export async function refreshGoogleAccessToken(refreshToken: string) {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: getEnv("GOOGLE_CLIENT_ID"),
    client_secret: getEnv("GOOGLE_CLIENT_SECRET"),
    grant_type: "refresh_token",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const details = await parseGoogleError(res);
    throw new Error(`Google refresh failed: ${res.status} ${details.errorCode} ${details.errorDescription}`.trim());
  }

  const data = await res.json();
  const expiresAt = data.expires_in
    ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString()
    : undefined;

  return {
    accessToken: data.access_token as string,
    refreshToken: (data.refresh_token as string | undefined) ?? undefined,
    expiresAt,
  };
}

export async function googleProfile(accessToken: string) {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    return undefined;
  }
  const data = await res.json();
  return data.email as string | undefined;
}



