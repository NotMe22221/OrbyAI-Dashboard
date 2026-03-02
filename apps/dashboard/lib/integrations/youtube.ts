import type { AgentBAction } from "@resident-secretary/contracts";
import { QUICK_SAY_EXAMPLES } from "../constants";
import { buildGoogleAuthUrl, exchangeGoogleCode, googleProfile } from "./google-shared";
import type { IntegrationProvider } from "./types";

const YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";

async function executeYouTube(action: AgentBAction, accessToken: string) {
  const query = String(action.params.query ?? "productivity");
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=5&q=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!res.ok) {
    throw new Error(`YouTube read failed: ${res.status}`);
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
  async executeAction(action, accessToken) {
    return executeYouTube(action, accessToken);
  },
};



