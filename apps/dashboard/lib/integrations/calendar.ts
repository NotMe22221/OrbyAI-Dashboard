import type { AgentBAction } from "@resident-secretary/contracts";
import { QUICK_SAY_EXAMPLES } from "../constants";
import { buildGoogleAuthUrl, exchangeGoogleCode, googleProfile } from "./google-shared";
import type { IntegrationProvider } from "./types";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

async function executeCalendar(action: AgentBAction, accessToken: string) {
  switch (action.operation) {
    case "list_events": {
      const timeMin = new Date().toISOString();
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=10&singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(timeMin)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) {
        throw new Error(`Calendar read failed: ${res.status}`);
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
  async executeAction(action, accessToken) {
    return executeCalendar(action, accessToken);
  },
};



