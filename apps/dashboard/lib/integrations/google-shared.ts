import { getEnv } from "../env";

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
    throw new Error(`Google token exchange failed: ${res.status}`);
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



