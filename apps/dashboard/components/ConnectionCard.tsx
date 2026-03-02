"use client";

import type { IntegrationService } from "@resident-secretary/contracts";

type ConnectionCardProps = {
  service: IntegrationService;
  connected: boolean;
  account: string | null;
  lastUsed: string | null;
  quickSay: string[];
  ready: boolean;
  missingEnv: string[];
  onConnect: (service: IntegrationService) => void;
  onDisconnect: (service: IntegrationService) => void;
};

export function ConnectionCard(props: ConnectionCardProps) {
  return (
    <article className="rounded-2xl border border-white/10 bg-panel/60 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${props.connected ? "bg-ok" : "bg-slate-500"}`} />
          <h3 className="text-base font-semibold capitalize text-white">{props.service}</h3>
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



