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

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

async function throwCalendarApiError(res: Response): Promise<never> {
  const details = await parseGoogleApiFailure(res);
  if (details.auth) {
    throw new IntegrationAuthError("calendar", "token_expired", "Calendar authorization expired. Reconnect Calendar in Connections.");
  }

  throw new Error(`Calendar API failed: ${details.status}${details.message ? ` ${details.message}` : ""}`);
}

async function executeCalendar(action: AgentBAction, accessToken: string) {
  switch (action.operation) {
    case "list_events": {
      const timeMin = new Date().toISOString();
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=10&singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(timeMin)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) {
        await throwCalendarApiError(res);
      }
      return res.json();
    }
    case "create_or_update_event":
      return {
        status: "prepared",
        note: "Calendar write action received and requires confirmed operation payload.",
        action,
      };
    default:
      return { status: "noop", note: `Unsupported Calendar operation: ${action.operation}` };
  }
}

export const calendarProvider: IntegrationProvider = {
  service: "calendar",
  requiredEnv: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  quickSay: QUICK_SAY_EXAMPLES.calendar,
  getAuthorizationUrl({ redirectUri, state }) {
    return buildGoogleAuthUrl(CALENDAR_SCOPE, redirectUri, state);
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
      throw new IntegrationAuthError("calendar", code, "Calendar authorization expired or was revoked. Reconnect Calendar.");
    }
  },
  async healthCheck(accessToken) {
    const res = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      return { ok: true };
    }
    const details = await parseGoogleApiFailure(res);
    if (details.auth) {
      return { ok: false, code: "token_expired", message: "Calendar token is invalid or expired." };
    }
    return {
      ok: false,
      code: "api_error",
      message: details.message || "Unable to validate Calendar connection.",
    };
  },
  async executeAction(action, accessToken) {
    return executeCalendar(action, accessToken);
  },
};
