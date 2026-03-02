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

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify";

function getHeader(headers: Array<{ name?: string; value?: string }> | undefined, name: string) {
  const match = headers?.find((h) => (h?.name ?? "").toLowerCase() === name.toLowerCase());
  return match?.value ?? "";
}

async function throwGmailApiError(res: Response): Promise<never> {
  const details = await parseGoogleApiFailure(res);
  if (details.auth) {
    throw new IntegrationAuthError("gmail", "token_expired", "Gmail authorization expired. Reconnect Gmail in Connections.");
  }

  throw new Error(`Gmail API failed: ${details.status}${details.message ? ` ${details.message}` : ""}`);
}

async function executeGmail(action: AgentBAction, accessToken: string) {
  switch (action.operation) {
    case "read_inbox": {
      const listRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=3", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!listRes.ok) {
        await throwGmailApiError(listRes);
      }

      const listPayload = await listRes.json();
      const messageIds: string[] = (listPayload?.messages ?? []).map((m: { id?: string }) => m.id).filter(Boolean);

      const details = await Promise.all(
        messageIds.map(async (id) => {
          const msgRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );

          if (!msgRes.ok) {
            return { id, subject: "(unable to fetch subject)", from: "", date: "", snippet: "" };
          }

          const msg = await msgRes.json();
          const headers = msg?.payload?.headers as Array<{ name?: string; value?: string }> | undefined;
          return {
            id,
            subject: getHeader(headers, "Subject") || "(no subject)",
            from: getHeader(headers, "From"),
            date: getHeader(headers, "Date"),
            snippet: String(msg?.snippet ?? ""),
          };
        }),
      );

      return {
        total: details.length,
        messages: details,
      };
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
  async refreshToken(refreshToken) {
    try {
      return await refreshGoogleAccessToken(refreshToken);
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      const code = message.includes("invalid_grant") ? "token_revoked" : "reauth_required";
      throw new IntegrationAuthError("gmail", code, "Gmail authorization expired or was revoked. Reconnect Gmail.");
    }
  },
  async healthCheck(accessToken) {
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      return { ok: true };
    }
    const details = await parseGoogleApiFailure(res);
    if (details.auth) {
      return { ok: false, code: "token_expired", message: "Gmail token is invalid or expired." };
    }
    return {
      ok: false,
      code: "api_error",
      message: details.message || "Unable to validate Gmail connection.",
    };
  },
  async executeAction(action, accessToken) {
    return executeGmail(action, accessToken);
  },
};
