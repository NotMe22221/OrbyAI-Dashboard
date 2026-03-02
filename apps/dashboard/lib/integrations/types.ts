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

export interface IntegrationProvider {
  service: IntegrationService;
  requiredEnv: string[];
  quickSay: string[];
  getAuthorizationUrl(args: AuthUrlArgs): string;
  exchangeCode(code: string, redirectUri: string): Promise<OAuthTokenResult>;
  executeAction(action: AgentBAction, accessToken: string): Promise<unknown>;
}



