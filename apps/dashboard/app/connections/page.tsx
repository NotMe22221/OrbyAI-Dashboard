"use client";

import { useEffect, useMemo, useState } from "react";
import type { IntegrationService } from "@resident-secretary/contracts";
import { ConnectionCard } from "@/components/ConnectionCard";
import { QUICK_SAY_EXAMPLES } from "@/lib/constants";

type IntegrationStatus = {
  service: IntegrationService;
  connected: boolean;
  account: string | null;
  last_used: string | null;
  ready: boolean;
  missing_env: string[];
};

export default function ConnectionsPage() {
  const [items, setItems] = useState<IntegrationStatus[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/integrations/status");
    const data = await res.json();
    if (!res.ok) {
      setError(data?.error ?? "Unable to load integration status.");
      return;
    }
    setItems(data.integrations ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function connect(service: IntegrationService) {
    setError(null);
    const res = await fetch(`/api/auth/${service}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data?.error ?? `Unable to connect ${service}.`);
      return;
    }
    window.location.href = data.authorization_url;
  }

  async function disconnect(service: IntegrationService) {
    setError(null);
    const res = await fetch(`/api/auth/${service}?action=disconnect`);
    const data = await res.json();
    if (!res.ok) {
      setError(data?.error ?? `Unable to disconnect ${service}.`);
      return;
    }
    await load();
  }

  const list = useMemo(() => items.sort((a, b) => a.service.localeCompare(b.service)), [items]);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-white/10 bg-panel/60 p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Connections</p>
        <p className="mt-2 text-sm text-slate-300">
          Connect Gmail, Calendar, YouTube, Slack, Linear, and Notion via OAuth. Tokens remain server-side only.
        </p>
        {error && <p className="mt-2 text-sm text-red-200">{error}</p>}
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        {list.map((item) => (
          <ConnectionCard
            key={item.service}
            service={item.service}
            connected={item.connected}
            account={item.account}
            lastUsed={item.last_used}
            quickSay={QUICK_SAY_EXAMPLES[item.service]}
            ready={item.ready}
            missingEnv={item.missing_env}
            onConnect={connect}
            onDisconnect={disconnect}
          />
        ))}
      </div>
    </div>
  );
}



