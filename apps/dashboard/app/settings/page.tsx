"use client";

import { useEffect, useMemo, useState } from "react";

type IntegrationStatus = {
  service: string;
  connected: boolean;
  account: string | null;
  ready: boolean;
  missing_env: string[];
};

type VoiceHealth = {
  asr_mode: "browser_primary";
  vapi_available: boolean;
  tts_available: boolean;
  llm: {
    agent_a: "gemini" | "heuristic";
    agent_b: "claude" | "heuristic";
  };
  timestamp: string;
};

export default function SettingsPage() {
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus[]>([]);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [voiceHealth, setVoiceHealth] = useState<VoiceHealth | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch("/api/integrations/status")
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!mounted) return;
        if (!ok) {
          setStatusError(data?.error ?? "Unable to load integration status.");
          return;
        }
        setIntegrationStatus(data.integrations ?? []);
      })
      .catch(() => {
        if (!mounted) return;
        setStatusError("Unable to load integration status.");
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    fetch("/api/voice/health")
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!mounted || !ok) {
          return;
        }
        setVoiceHealth(data as VoiceHealth);
      })
      .catch(() => {
        // keep null if unavailable
      });

    return () => {
      mounted = false;
    };
  }, []);

  const connectedCount = useMemo(
    () => integrationStatus.filter((item) => item.connected).length,
    [integrationStatus],
  );

  const readyCount = useMemo(
    () => integrationStatus.filter((item) => item.ready).length,
    [integrationStatus],
  );

  return (
    <div className="grid gap-4">
      <section className="rounded-2xl border border-white/10 bg-panel/60 p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Settings</p>
        <p className="mt-2 text-sm text-slate-200">
          Runtime health and security status for this dashboard instance.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-panelSoft/40 p-3">
            <p className="text-xs uppercase tracking-[0.15em] text-slate-400">Integrations</p>
            <p className="mt-1 text-lg font-semibold text-white">{connectedCount} connected</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-panelSoft/40 p-3">
            <p className="text-xs uppercase tracking-[0.15em] text-slate-400">Configured</p>
            <p className="mt-1 text-lg font-semibold text-white">{readyCount} ready</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-panelSoft/40 p-3">
            <p className="text-xs uppercase tracking-[0.15em] text-slate-400">Voice</p>
            <p className="mt-1 text-lg font-semibold text-white">Browser + ElevenLabs</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-panel/60 p-4">
        <p className="text-sm font-semibold text-white">Integration Runtime</p>
        {statusError ? (
          <p className="mt-2 text-sm text-red-200">{statusError}</p>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {integrationStatus.map((item) => (
              <div key={item.service} className="rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="text-sm font-medium capitalize text-white">{item.service}</p>
                <p className="text-xs text-slate-300">{item.connected ? item.account ?? "Connected" : "Disconnected"}</p>
                {!item.ready && (
                  <p className="mt-1 text-xs text-amber-200">Missing env: {item.missing_env.join(", ")}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-panel/60 p-4">
        <p className="text-sm font-semibold text-white">Security Rules Enforced</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
          <li>Confirmation before send/post/delete/modify actions.</li>
          <li>LLM output is Zod-validated before execution.</li>
          <li>OAuth tokens are stored server-side and encrypted before DB write.</li>
          <li>No raw audio persistence.</li>
          <li>Context window limited to the last 5 messages.</li>
        </ul>
      </section>

      <section className="rounded-2xl border border-white/10 bg-panel/60 p-4">
        <p className="text-sm font-semibold text-white">Voice + Assistant Runtime</p>
        {!voiceHealth ? (
          <p className="mt-2 text-sm text-slate-300">Unable to load voice health data.</p>
        ) : (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="text-xs uppercase tracking-[0.15em] text-slate-400">ASR Mode</p>
              <p className="text-sm text-white">{voiceHealth.asr_mode}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="text-xs uppercase tracking-[0.15em] text-slate-400">Vapi Available</p>
              <p className="text-sm text-white">{voiceHealth.vapi_available ? "Yes" : "No"}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="text-xs uppercase tracking-[0.15em] text-slate-400">TTS Available</p>
              <p className="text-sm text-white">{voiceHealth.tts_available ? "Yes" : "No"}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="text-xs uppercase tracking-[0.15em] text-slate-400">LLM Runtime</p>
              <p className="text-sm text-white">Agent A: {voiceHealth.llm.agent_a} | Agent B: {voiceHealth.llm.agent_b}</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
