"use client";

import { useEffect, useMemo, useState } from "react";
import type { IntegrationService } from "@resident-secretary/contracts";
import { ConnectionCard } from "@/components/ConnectionCard";
import { QUICK_SAY_EXAMPLES } from "@/lib/constants";

type IntegrationStatus = {
  service: IntegrationService;
  connected: boolean;
  state: "connected" | "expired" | "error" | "disconnected";
  account: string | null;
  expires_at: string | null;
  last_used: string | null;
  ready: boolean;
  missing_env: string[];
  health: {
    ok: boolean;
    checked_at: string;
    code?: string;
    message?: string;
  };
};

type CallbackResult = {
  provider: IntegrationService | null;
  status: string | null;
  reason: string | null;
} | null;

export default function ConnectionsPage() {
  const [items, setItems] = useState<IntegrationStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [origin, setOrigin] = useState<string>("http://localhost:3000");
  const [callbackResult, setCallbackResult] = useState<CallbackResult>(null);

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
    setOrigin(window.location.origin);

    const params = new URLSearchParams(window.location.search);
    const provider = params.get("provider");
    const status = params.get("status");
    const reason = params.get("reason");

    setCallbackResult({
      provider: provider as IntegrationService | null,
      status,
      reason,
    });
  }, []);

  useEffect(() => {
    if (!callbackResult) {
      return;
    }

    const { provider, status, reason } = callbackResult;
    if (status === "error") {
      const message = reason ? decodeURIComponent(reason) : "OAuth connection failed.";
      setError(message);
      setInfo(null);
      return;
    }

    if (status === "connected" && provider) {
      const service = items.find((item) => item.service === provider);
      if (!service) {
        return;
      }
      if (service.state === "connected") {
        setInfo(`${provider} connected and verified.`);
        setError(null);
      } else {
        setInfo(null);
        setError(service.health.message ?? `${provider} callback succeeded but connection validation failed. Reconnect ${provider}.`);
      }
    }
  }, [callbackResult, items]);

  async function connect(service: IntegrationService) {
    setError(null);
    setInfo(null);
    const res = await fetch(`/api/auth/${service}`);
    const data = await res.json();
    if (!res.ok) {
      const missing = Array.isArray(data?.missing_env) ? ` Missing: ${data.missing_env.join(", ")}` : "";
      setError((data?.error ?? `Unable to connect ${service}.`) + missing);
      return;
    }
    window.location.href = data.authorization_url;
  }

  async function disconnect(service: IntegrationService) {
    setError(null);
    setInfo(null);
    const res = await fetch(`/api/auth/${service}?action=disconnect`);
    const data = await res.json();
    if (!res.ok) {
      setError(data?.error ?? `Unable to disconnect ${service}.`);
      return;
    }
    setInfo(`${service} disconnected.`);
    await load();
  }

  const list = useMemo(() => [...items].sort((a, b) => a.service.localeCompare(b.service)), [items]);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-white/10 bg-panel/60 p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Connections</p>
        <p className="mt-2 text-sm text-slate-300">
          Connect Gmail, Calendar, YouTube, and Notion via OAuth. Tokens remain server-side only.
        </p>
        {info && <p className="mt-2 text-sm text-green-200">{info}</p>}
        {error && <p className="mt-2 text-sm text-red-200">{error}</p>}
      </section>

      <section className="rounded-2xl border border-white/10 bg-panel/60 p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">OAuth Callback URLs</p>
        <div className="mt-2 space-y-2 text-sm text-slate-200">
          <p>Google Cloud OAuth (add all):</p>
          <pre className="whitespace-pre-wrap rounded-lg bg-black/20 p-3 text-xs">{`${origin}/api/auth/callback/gmail\n${origin}/api/auth/callback/calendar\n${origin}/api/auth/callback/youtube`}</pre>
          <p>Notion OAuth redirect URI:</p>
          <pre className="whitespace-pre-wrap rounded-lg bg-black/20 p-3 text-xs">{`${origin}/api/auth/callback/notion`}</pre>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        {list.map((item) => (
          <ConnectionCard
            key={item.service}
            service={item.service}
            connected={item.connected}
            state={item.state}
            account={item.account}
            lastUsed={item.last_used}
            expiresAt={item.expires_at}
            quickSay={QUICK_SAY_EXAMPLES[item.service]}
            ready={item.ready}
            missingEnv={item.missing_env}
            health={item.health}
            onConnect={connect}
            onDisconnect={disconnect}
          />
        ))}
      </div>
    </div>
  );
}

