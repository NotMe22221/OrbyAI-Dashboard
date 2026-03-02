import type { AgentBAction } from "@resident-secretary/contracts";
import { QUICK_SAY_EXAMPLES } from "../constants";
import { getEnv, optionalEnv } from "../env";
import type { IntegrationProvider } from "./types";

function buildNotionAuthUrl(redirectUri: string, state: string) {
  const override = optionalEnv("NOTION_AUTHORIZATION_URL");
  if (override) {
    const url = new URL(override);
    if (!url.searchParams.has("state")) {
      url.searchParams.set("state", state);
    }
    return url.toString();
  }

  const url = new URL("https://api.notion.com/v1/oauth/authorize");
  url.searchParams.set("client_id", getEnv("NOTION_CLIENT_ID"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("owner", "user");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

async function exchangeNotionCode(code: string, redirectUri: string) {
  const basic = Buffer.from(`${getEnv("NOTION_CLIENT_ID")}:${getEnv("NOTION_CLIENT_SECRET")}`).toString("base64");

  const res = await fetch("https://api.notion.com/v1/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    throw new Error(`Notion token exchange failed: ${res.status}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token as string,
    accountEmail:
      (data?.owner?.user?.person?.email as string | undefined) ??
      (data?.workspace_name as string | undefined) ??
      "notion-workspace",
  };
}

async function executeNotion(action: AgentBAction, accessToken: string) {
  const searchBody = {
    query: String(action.params.query ?? ""),
    page_size: 10,
  };

  const res = await fetch("https://api.notion.com/v1/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(searchBody),
  });

  if (!res.ok) {
    throw new Error(`Notion action failed: ${res.status}`);
  }

  return res.json();
}

export const notionProvider: IntegrationProvider = {
  service: "notion",
  requiredEnv: ["NOTION_CLIENT_ID", "NOTION_CLIENT_SECRET"],
  quickSay: QUICK_SAY_EXAMPLES.notion,
  getAuthorizationUrl({ redirectUri, state }) {
    return buildNotionAuthUrl(redirectUri, state);
  },
  async exchangeCode(code, redirectUri) {
    return exchangeNotionCode(code, redirectUri);
  },
  async executeAction(action, accessToken) {
    return executeNotion(action, accessToken);
  },
};



