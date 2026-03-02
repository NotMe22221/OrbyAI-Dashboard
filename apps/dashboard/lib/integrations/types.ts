import type { AgentBAction, IntegrationService } from "@resident-secretary/contracts";

export type OAuthTokenResult = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  accountEmail?: string;
};

export type AuthUrlArgs = {
  redirectUri: string;
  state: string;
};

export type RefreshTokenResult = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
};

export type IntegrationHealth = {
  ok: boolean;
  code?: string;
  message?: string;
};

export interface IntegrationProvider {
  service: IntegrationService;
  requiredEnv: string[];
  quickSay: string[];
  getAuthorizationUrl(args: AuthUrlArgs): string;
  exchangeCode(code: string, redirectUri: string): Promise<OAuthTokenResult>;
  executeAction(action: AgentBAction, accessToken: string): Promise<unknown>;
  refreshToken?(refreshToken: string): Promise<RefreshTokenResult>;
  healthCheck?(accessToken: string): Promise<IntegrationHealth>;
}



