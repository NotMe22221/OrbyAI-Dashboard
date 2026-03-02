import type { AgentBAction, IntegrationService } from "@resident-secretary/contracts";
import { decryptSecret, encryptSecret } from "../crypto";
import { getIntegrationRow, upsertIntegration } from "../db";
import { getMockActionResult } from "../mock-data";
import { calendarProvider } from "./calendar";
import { IntegrationAuthError, isIntegrationAuthError } from "./errors";
import { gmailProvider } from "./gmail";
import { notionProvider } from "./notion";
import type { IntegrationHealth, IntegrationProvider } from "./types";
import { youtubeProvider } from "./youtube";

const TOKEN_EXPIRY_SKEW_MS = 2 * 60 * 1000;
const HEALTH_TIMEOUT_MS = 5000;
const AUTH_CODES = new Set(["token_expired", "token_revoked", "reauth_required"]);

type IntegrationRow = {
  user_id: string;
  service: IntegrationService;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  account_email: string | null;
};

export type IntegrationConnectionState = "connected" | "expired" | "error" | "disconnected";

export type IntegrationConnectionReport = {
  service: IntegrationService;
  connected: boolean;
  state: IntegrationConnectionState;
  account: string | null;
  expires_at: string | null;
  health: {
    ok: boolean;
    checked_at: string;
    code?: string;
    message?: string;
  };
};

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

function isExpiredSoon(expiresAt: string | null | undefined) {
  if (!expiresAt) {
    return false;
  }
  const time = Date.parse(expiresAt);
  if (Number.isNaN(time)) {
    return true;
  }
  return time - Date.now() <= TOKEN_EXPIRY_SKEW_MS;
}

function toIntegrationAuthError(service: IntegrationService, error: unknown, fallbackCode: "token_expired" | "token_revoked" | "reauth_required" = "reauth_required") {
  if (isIntegrationAuthError(error)) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error ?? "");
  const lower = message.toLowerCase();
  if (
    lower.includes("401") ||
    lower.includes("403") ||
    lower.includes("token") ||
    lower.includes("authorization") ||
    lower.includes("invalid_grant")
  ) {
    const code = lower.includes("invalid_grant") ? "token_revoked" : fallbackCode;
    return new IntegrationAuthError(service, code, `Connection to ${service} is no longer valid. Reconnect ${service} in Connections.`);
  }
  return null;
}

function authIssueCode(health: IntegrationHealth) {
  if (!health.code) {
    return false;
  }
  return AUTH_CODES.has(health.code);
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`timeout_after_${ms}ms`));
    }, ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function decryptAccessToken(row: IntegrationRow) {
  try {
    return decryptSecret(row.access_token);
  } catch {
    throw new IntegrationAuthError(row.service, "reauth_required", `Stored ${row.service} token is unreadable. Reconnect ${row.service}.`);
  }
}

async function refreshAccessToken(params: {
  userId: string;
  row: IntegrationRow;
  provider: IntegrationProvider;
}) {
  const { userId, row, provider } = params;
  if (!provider.refreshToken) {
    throw new IntegrationAuthError(row.service, "reauth_required", `${row.service} requires reconnection.`);
  }
  if (!row.refresh_token) {
    throw new IntegrationAuthError(row.service, "reauth_required", `${row.service} has no refresh token. Reconnect ${row.service}.`);
  }

  let refreshPlain = "";
  try {
    refreshPlain = decryptSecret(row.refresh_token);
  } catch {
    throw new IntegrationAuthError(row.service, "reauth_required", `${row.service} refresh token is invalid. Reconnect ${row.service}.`);
  }

  let refreshed;
  try {
    refreshed = await provider.refreshToken(refreshPlain);
  } catch (error) {
    throw toIntegrationAuthError(row.service, error) ??
      new IntegrationAuthError(row.service, "token_revoked", `${row.service} refresh failed. Reconnect ${row.service}.`);
  }

  const encryptedAccess = encryptSecret(refreshed.accessToken);
  const encryptedRefresh = refreshed.refreshToken ? encryptSecret(refreshed.refreshToken) : row.refresh_token;
  const nextExpiresAt = refreshed.expiresAt ?? row.expires_at ?? undefined;

  await upsertIntegration({
    userId,
    service: row.service,
    accessToken: encryptedAccess,
    refreshToken: encryptedRefresh ?? undefined,
    expiresAt: nextExpiresAt,
    accountEmail: row.account_email ?? undefined,
  });

  const updatedRow: IntegrationRow = {
    ...row,
    access_token: encryptedAccess,
    refresh_token: encryptedRefresh ?? null,
    expires_at: nextExpiresAt ?? null,
  };

  return { accessToken: refreshed.accessToken, row: updatedRow };
}

async function ensureAccessToken(params: {
  userId: string;
  row: IntegrationRow;
  provider: IntegrationProvider;
  forceRefresh?: boolean;
}) {
  const { userId, row, provider, forceRefresh } = params;
  if (forceRefresh || isExpiredSoon(row.expires_at)) {
    return refreshAccessToken({ userId, row, provider });
  }
  const accessToken = await decryptAccessToken(row);
  return { accessToken, row };
}

async function runHealthCheck(provider: IntegrationProvider, accessToken: string): Promise<IntegrationHealth> {
  if (!provider.healthCheck) {
    return { ok: true };
  }
  try {
    const result = await withTimeout(provider.healthCheck(accessToken), HEALTH_TIMEOUT_MS);
    return result;
  } catch (error) {
    const auth = toIntegrationAuthError(provider.service, error, "token_expired");
    if (auth) {
      return { ok: false, code: auth.code, message: auth.message };
    }
    const message = error instanceof Error ? error.message : "Health check failed.";
    return { ok: false, code: "health_check_failed", message };
  }
}

function normalizeRow(row: Awaited<ReturnType<typeof getIntegrationRow>>): IntegrationRow | null {
  if (!row) {
    return null;
  }
  return row as IntegrationRow;
}

export async function getIntegrationConnectionReport(userId: string, service: IntegrationService): Promise<IntegrationConnectionReport> {
  const checkedAt = new Date().toISOString();
  const provider = integrationProviders[service];
  if (!provider) {
    return {
      service,
      connected: false,
      state: "error",
      account: null,
      expires_at: null,
      health: {
        ok: false,
        checked_at: checkedAt,
        code: "service_disabled",
        message: `${service} integration is disabled.`,
      },
    };
  }

  const rawRow = await getIntegrationRow(userId, service);
  const row = normalizeRow(rawRow);
  if (!row) {
    return {
      service,
      connected: false,
      state: "disconnected",
      account: null,
      expires_at: null,
      health: {
        ok: false,
        checked_at: checkedAt,
        code: "not_connected",
        message: `${service} is not connected.`,
      },
    };
  }

  try {
    let access = await ensureAccessToken({ userId, row, provider });
    let health = await runHealthCheck(provider, access.accessToken);

    if (!health.ok && authIssueCode(health)) {
      try {
        access = await ensureAccessToken({ userId, row: access.row, provider, forceRefresh: true });
        health = await runHealthCheck(provider, access.accessToken);
      } catch (refreshError) {
        const auth = toIntegrationAuthError(service, refreshError, "reauth_required");
        if (auth) {
          return {
            service,
            connected: false,
            state: "expired",
            account: row.account_email,
            expires_at: row.expires_at,
            health: {
              ok: false,
              checked_at: checkedAt,
              code: auth.code,
              message: auth.message,
            },
          };
        }
      }
    }

    if (health.ok) {
      return {
        service,
        connected: true,
        state: "connected",
        account: access.row.account_email,
        expires_at: access.row.expires_at,
        health: {
          ok: true,
          checked_at: checkedAt,
        },
      };
    }

    const state: IntegrationConnectionState = authIssueCode(health) ? "expired" : "error";
    return {
      service,
      connected: false,
      state,
      account: access.row.account_email,
      expires_at: access.row.expires_at,
      health: {
        ok: false,
        checked_at: checkedAt,
        code: health.code,
        message: health.message,
      },
    };
  } catch (error) {
    const auth = toIntegrationAuthError(service, error, "reauth_required");
    if (auth) {
      return {
        service,
        connected: false,
        state: "expired",
        account: row.account_email,
        expires_at: row.expires_at,
        health: {
          ok: false,
          checked_at: checkedAt,
          code: auth.code,
          message: auth.message,
        },
      };
    }

    return {
      service,
      connected: false,
      state: "error",
      account: row.account_email,
      expires_at: row.expires_at,
      health: {
        ok: false,
        checked_at: checkedAt,
        code: "health_check_failed",
        message: error instanceof Error ? error.message : `${service} health check failed.`,
      },
    };
  }
}

export async function executeIntegrationAction(userId: string, action: AgentBAction) {
  const provider = integrationProviders[action.service];
  if (!provider) {
    throw new Error(`${action.service} integration is disabled.`);
  }
  const rawRow = await getIntegrationRow(userId, action.service);
  const row = normalizeRow(rawRow);

  if (!row) {
    return getMockActionResult(action);
  }

  let tokenState = await ensureAccessToken({ userId, row, provider });

  try {
    return await provider.executeAction(action, tokenState.accessToken);
  } catch (error) {
    const auth = toIntegrationAuthError(action.service, error, "token_expired");
    if (!auth) {
      throw error;
    }
  }

  try {
    tokenState = await ensureAccessToken({
      userId,
      row: tokenState.row,
      provider,
      forceRefresh: true,
    });
    return await provider.executeAction(action, tokenState.accessToken);
  } catch (error) {
    throw toIntegrationAuthError(action.service, error, "reauth_required") ??
      new IntegrationAuthError(action.service, "reauth_required", `Unable to reauthorize ${action.service}. Reconnect ${action.service} in Connections.`);
  }
}

