import type { AgentBAction } from "@resident-secretary/contracts";
import { QUICK_SAY_EXAMPLES } from "../constants";
import { getEnv } from "../env";
import type { IntegrationProvider } from "./types";

function buildLinearAuthUrl(redirectUri: string, state: string) {
  const url = new URL("https://linear.app/oauth/authorize");
  url.searchParams.set("client_id", getEnv("LINEAR_CLIENT_ID"));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "issues:read issues:write");
  url.searchParams.set("state", state);
  return url.toString();
}

async function exchangeLinearCode(code: string, redirectUri: string) {
  const res = await fetch("https://api.linear.app/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: getEnv("LINEAR_CLIENT_ID"),
      client_secret: getEnv("LINEAR_CLIENT_SECRET"),
    }),
  });

  if (!res.ok) {
    throw new Error(`Linear token exchange failed: ${res.status}`);
  }

  const data = await res.json();
  const expiresAt = data.expires_in
    ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString()
    : undefined;

  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string | undefined,
    expiresAt,
    accountEmail: data.organization_id ? `org:${data.organization_id}` : undefined,
  };
}

async function executeLinear(action: AgentBAction, accessToken: string) {
  if (action.operation === "create_or_update_issue") {
    return {
      status: "prepared",
      note: "Linear mutation action prepared. Provide explicit title/description params for execution.",
      action,
    };
  }

  const query = `query { viewer { id name email } issues(first: 10) { nodes { id identifier title state { name } } } }`;
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      Authorization: accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    throw new Error(`Linear read failed: ${res.status}`);
  }

  return res.json();
}

export const linearProvider: IntegrationProvider = {
  service: "linear",
  requiredEnv: ["LINEAR_CLIENT_ID", "LINEAR_CLIENT_SECRET"],
  quickSay: QUICK_SAY_EXAMPLES.linear,
  getAuthorizationUrl({ redirectUri, state }) {
    return buildLinearAuthUrl(redirectUri, state);
  },
  async exchangeCode(code, redirectUri) {
    return exchangeLinearCode(code, redirectUri);
  },
  async executeAction(action, accessToken) {
    return executeLinear(action, accessToken);
  },
};



