import type { AgentBAction } from "@resident-secretary/contracts";
import { QUICK_SAY_EXAMPLES } from "../constants";
import { buildGoogleAuthUrl, exchangeGoogleCode, googleProfile } from "./google-shared";
import type { IntegrationProvider } from "./types";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify";

async function executeGmail(action: AgentBAction, accessToken: string) {
  switch (action.operation) {
    case "read_inbox": {
      const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        throw new Error(`Gmail read failed: ${res.status}`);
      }
      return res.json();
    }
    case "send_email":
    case "draft_reply":
      return {
        status: "prepared",
        note: "Gmail send/draft action received and requires approval execution details.",
        action,
      };
    default:
      return { status: "noop", note: `Unsupported Gmail operation: ${action.operation}` };
  }
}

export const gmailProvider: IntegrationProvider = {
  service: "gmail",
  requiredEnv: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  quickSay: QUICK_SAY_EXAMPLES.gmail,
  getAuthorizationUrl({ redirectUri, state }) {
    return buildGoogleAuthUrl(GMAIL_SCOPE, redirectUri, state);
  },
  async exchangeCode(code, redirectUri) {
    const tokens = await exchangeGoogleCode(code, redirectUri);
    const accountEmail = await googleProfile(tokens.accessToken);
    return { ...tokens, accountEmail };
  },
  async executeAction(action, accessToken) {
    return executeGmail(action, accessToken);
  },
};



