import type { SSEEvent } from "@resident-secretary/contracts";

type Listener = (event: SSEEvent) => void;

type Hub = {
  channels: Map<string, Set<Listener>>;
};

const globalKey = "__residentSecretarySSEHub" as const;

function getHub(): Hub {
  const scope = globalThis as unknown as Record<string, Hub | undefined>;
  if (!scope[globalKey]) {
    scope[globalKey] = { channels: new Map<string, Set<Listener>>() };
  }
  return scope[globalKey]!;
}

export function publishEvent(sessionId: string, event: SSEEvent) {
  const listeners = getHub().channels.get(sessionId);
  if (!listeners) {
    return;
  }

  for (const listener of listeners) {
    listener(event);
  }
}

export function subscribeToSession(sessionId: string, listener: Listener) {
  const hub = getHub();
  const existing = hub.channels.get(sessionId) ?? new Set<Listener>();
  existing.add(listener);
  hub.channels.set(sessionId, existing);

  return () => {
    const current = hub.channels.get(sessionId);
    if (!current) {
      return;
    }

    current.delete(listener);
    if (current.size === 0) {
      hub.channels.delete(sessionId);
    }
  };
}



