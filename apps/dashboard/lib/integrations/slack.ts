import type { AgentBAction } from "@resident-secretary/contracts";
import { QUICK_SAY_EXAMPLES } from "../constants";
import { getEnv } from "../env";
import type { IntegrationProvider } from "./types";

function buildSlackAuthUrl(redirectUri: string, state: string) {
  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", getEnv("SLACK_CLIENT_ID"));
  url.searchParams.set("scope", "chat:write,channels:read");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

async function exchangeSlackCode(code: string, redirectUri: string) {
  const body = new URLSearchParams({
    code,
    client_id: getEnv("SLACK_CLIENT_ID"),
    client_secret: getEnv("SLACK_CLIENT_SECRET"),
    redirect_uri: redirectUri,
  });

  const res = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(`Slack token exchange failed: ${res.status}`);
  }

  return {
    accessToken: data.access_token as string,
    accountEmail: (data?.authed_user?.id as string | undefined) ?? (data?.team?.name as string | undefined),
  };
}

async function executeSlack(action: AgentBAction, accessToken: string) {
  if (action.operation === "post_message") {
    const channel = String(action.params.channel ?? "general");
    const text = String(action.params.text ?? action.params.query ?? "Resident Secretary update");
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel, text }),
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(`Slack post failed: ${res.status}`);
    }
    return data;
  }

  const channelsRes = await fetch("https://slack.com/api/conversations.list?limit=20", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await channelsRes.json();
  if (!channelsRes.ok || !data.ok) {
    throw new Error(`Slack read failed: ${channelsRes.status}`);
  }
  return data;
}

export const slackProvider: IntegrationProvider = {
  service: "slack",
  requiredEnv: ["SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET"],
  quickSay: QUICK_SAY_EXAMPLES.slack,
  getAuthorizationUrl({ redirectUri, state }) {
    return buildSlackAuthUrl(redirectUri, state);
  },
  async exchangeCode(code, redirectUri) {
    return exchangeSlackCode(code, redirectUri);
  },
  async executeAction(action, accessToken) {
    return executeSlack(action, accessToken);
  },
};



