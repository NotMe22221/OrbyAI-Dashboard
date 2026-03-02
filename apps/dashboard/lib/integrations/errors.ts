import type { IntegrationService } from "@resident-secretary/contracts";

export type IntegrationAuthErrorCode =
  | "token_expired"
  | "token_revoked"
  | "reauth_required";

export class IntegrationAuthError extends Error {
  readonly service: IntegrationService;
  readonly code: IntegrationAuthErrorCode;

  constructor(service: IntegrationService, code: IntegrationAuthErrorCode, message: string) {
    super(message);
    this.name = "IntegrationAuthError";
    this.service = service;
    this.code = code;
  }
}

export function isIntegrationAuthError(value: unknown): value is IntegrationAuthError {
  return value instanceof IntegrationAuthError;
}

