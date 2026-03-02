import type { AgentBAction } from "@resident-secretary/contracts";

type PendingApproval = {
  userId: string;
  sessionId: string;
  actions: AgentBAction[];
  responseText: string;
  voiceSummary: string;
};

type Store = Map<string, PendingApproval>;

const key = "__residentSecretaryApprovals" as const;

function getStore(): Store {
  const scope = globalThis as unknown as Record<string, Store | undefined>;
  if (!scope[key]) {
    scope[key] = new Map<string, PendingApproval>();
  }
  return scope[key]!;
}

function buildKey(userId: string, sessionId: string) {
  return `${userId}:${sessionId}`;
}

export function setPendingApproval(payload: PendingApproval) {
  getStore().set(buildKey(payload.userId, payload.sessionId), payload);
}

export function getPendingApproval(userId: string, sessionId: string) {
  return getStore().get(buildKey(userId, sessionId));
}

export function clearPendingApproval(userId: string, sessionId: string) {
  getStore().delete(buildKey(userId, sessionId));
}

export function isApprovalTranscript(text: string) {
  const normalized = text.trim().toLowerCase();
  return ["yes", "y", "approve", "confirmed", "confirm", "do it", "send it", "go ahead"].includes(normalized);
}

export function isRejectionTranscript(text: string) {
  const normalized = text.trim().toLowerCase();
  return ["no", "n", "cancel", "stop", "reject", "do not"].includes(normalized);
}



