import type { AgentBAction, IntegrationService } from "@resident-secretary/contracts";
import { decryptSecret } from "../crypto";
import { getIntegrationRow } from "../db";
import { gmailProvider } from "./gmail";
import { calendarProvider } from "./calendar";
import { youtubeProvider } from "./youtube";
import { notionProvider } from "./notion";
import type { IntegrationProvider } from "./types";

export const integrationProviders: Partial<Record<IntegrationService, IntegrationProvider>> = {
  gmail: gmailProvider,
  calendar: calendarProvider,
  youtube: youtubeProvider,
  notion: notionProvider,
};

export function ensureProviderEnv(service: IntegrationService) {
  const provider = integrationProviders[service];
  if (!provider) {
    return {
      service,
      missing: ["service_disabled"],
      ready: false,
    };
  }
  const missing = provider.requiredEnv.filter((key) => !process.env[key]);
  return {
    service,
    missing,
    ready: missing.length === 0,
  };
}

export async function executeIntegrationAction(userId: string, action: AgentBAction) {
  const provider = integrationProviders[action.service];
  if (!provider) {
    throw new Error(`${action.service} integration is disabled.`);
  }
  const row = await getIntegrationRow(userId, action.service);

  if (!row) {
    throw new Error(`${action.service} is not connected for this user.`);
  }

  const accessToken = decryptSecret(row.access_token);
  return provider.executeAction(action, accessToken);
}



