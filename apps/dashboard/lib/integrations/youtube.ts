import type { AgentBAction } from "@resident-secretary/contracts";
import { QUICK_SAY_EXAMPLES } from "../constants";
import { IntegrationAuthError } from "./errors";
import {
  buildGoogleAuthUrl,
  exchangeGoogleCode,
  googleProfile,
  parseGoogleApiFailure,
  refreshGoogleAccessToken,
} from "./google-shared";
import type { IntegrationProvider } from "./types";

const YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";

async function throwYouTubeApiError(res: Response): Promise<never> {
  const details = await parseGoogleApiFailure(res);
  if (details.auth) {
    throw new IntegrationAuthError("youtube", "token_expired", "YouTube authorization expired. Reconnect YouTube in Connections.");
  }

  throw new Error(`YouTube API failed: ${details.status}${details.message ? ` ${details.message}` : ""}`);
}

async function executeYouTube(action: AgentBAction, accessToken: string) {
  const query = String(action.params.query ?? "productivity");
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=5&q=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!res.ok) {
    await throwYouTubeApiError(res);
  }

  return res.json();
}

export const youtubeProvider: IntegrationProvider = {
  service: "youtube",
  requiredEnv: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  quickSay: QUICK_SAY_EXAMPLES.youtube,
  getAuthorizationUrl({ redirectUri, state }) {
    return buildGoogleAuthUrl(YOUTUBE_SCOPE, redirectUri, state);
  },
  async exchangeCode(code, redirectUri) {
    const tokens = await exchangeGoogleCode(code, redirectUri);
    const accountEmail = await googleProfile(tokens.accessToken);
    return { ...tokens, accountEmail };
  },
  async refreshToken(refreshToken) {
    try {
      return await refreshGoogleAccessToken(refreshToken);
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      const code = message.includes("invalid_grant") ? "token_revoked" : "reauth_required";
      throw new IntegrationAuthError("youtube", code, "YouTube authorization expired or was revoked. Reconnect YouTube.");
    }
  },
  async healthCheck(accessToken) {
    const res = await fetch("https://www.googleapis.com/youtube/v3/channels?part=id&mine=true&maxResults=1", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      return { ok: true };
    }
    const details = await parseGoogleApiFailure(res);
    if (details.auth) {
      return { ok: false, code: "token_expired", message: "YouTube token is invalid or expired." };
    }
    return {
      ok: false,
      code: "api_error",
      message: details.message || "Unable to validate YouTube connection.",
    };
  },
  async executeAction(action, accessToken) {
    return executeYouTube(action, accessToken);
  },
};
