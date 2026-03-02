"use client";

import type { IntegrationService } from "@resident-secretary/contracts";

type HealthStatus = {
  ok: boolean;
  checked_at: string;
  code?: string;
  message?: string;
};

type ConnectionCardProps = {
  service: IntegrationService;
  connected: boolean;
  state: "connected" | "expired" | "error" | "disconnected";
  account: string | null;
  lastUsed: string | null;
  expiresAt: string | null;
  quickSay: string[];
  ready: boolean;
  missingEnv: string[];
  health: HealthStatus;
  onConnect: (service: IntegrationService) => void;
  onDisconnect: (service: IntegrationService) => void;
};

function statusTone(state: ConnectionCardProps["state"]) {
  if (state === "connected") {
    return {
      dot: "bg-ok",
      label: "Connected",
      chip: "border-emerald-300/40 bg-emerald-400/10 text-emerald-100",
    };
  }
  if (state === "expired") {
    return {
      dot: "bg-amber-400",
      label: "Expired",
      chip: "border-amber-300/40 bg-amber-400/10 text-amber-100",
    };
  }
  if (state === "error") {
    return {
      dot: "bg-err",
      label: "Error",
      chip: "border-err/40 bg-err/10 text-red-100",
    };
  }
  return {
    dot: "bg-slate-500",
    label: "Disconnected",
    chip: "border-white/20 bg-black/20 text-slate-300",
  };
}

export function ConnectionCard(props: ConnectionCardProps) {
  const tone = statusTone(props.state);

  return (
    <article className="rounded-2xl border border-white/10 bg-panel/60 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} />
          <h3 className="text-base font-semibold capitalize text-white">{props.service}</h3>
          <span className={`rounded-md border px-2 py-0.5 text-xs ${tone.chip}`}>{tone.label}</span>
        </div>
        <button
          type="button"
          onClick={() => (props.connected ? props.onDisconnect(props.service) : props.onConnect(props.service))}
          className="rounded-md border border-white/20 px-3 py-1.5 text-sm text-slate-100"
        >
          {props.connected ? "Disconnect" : "Connect"}
        </button>
      </div>

      <p className="mt-2 text-sm text-slate-300">Account: {props.account ?? "Not connected"}</p>
      <p className="text-sm text-slate-400">Last used: {props.lastUsed ?? "Never"}</p>
      <p className="text-sm text-slate-400">Token expiry: {props.expiresAt ?? "Unknown"}</p>

      {!props.health.ok && (
        <p className="mt-2 rounded-md border border-amber-300/40 bg-amber-400/10 px-2 py-1 text-xs text-amber-100">
          {props.health.message ?? `Connection check failed (${props.health.code ?? "unknown"}).`}
        </p>
      )}

      {!props.ready && (
        <p className="mt-2 rounded-md border border-err/50 bg-err/10 px-2 py-1 text-xs text-red-200">
          Missing env: {props.missingEnv.join(", ")}
        </p>
      )}

      <div className="mt-3 space-y-1">
        <p className="text-xs uppercase tracking-[0.15em] text-slate-400">Quick Say</p>
        {props.quickSay.map((example) => (
          <p key={example} className="text-xs text-slate-300">
            "{example}"
          </p>
        ))}
      </div>
    </article>
  );
}

