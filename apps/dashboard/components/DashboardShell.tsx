"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { QUICK_SAY_EXAMPLES, ALL_SERVICES } from "@/lib/constants";
import { ActivityStrip } from "./ActivityStrip";
import { Sidebar } from "./Sidebar";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

type StatusItem = {
  service: string;
  connected: boolean;
  account: string | null;
};

function QuickSayList() {
  const all = useMemo(() => ALL_SERVICES.flatMap((service) => QUICK_SAY_EXAMPLES[service].slice(0, 1)), []);
  return (
    <section className="rounded-2xl border border-white/10 bg-panel/70 p-4">
      <p className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-400">Quick Say</p>
      <div className="space-y-1">
        {all.map((example) => (
          <p key={example} className="text-xs text-slate-300">
            "{example}"
          </p>
        ))}
      </div>
    </section>
  );
}

function IntegrationStatusCards() {
  const [status, setStatus] = useState<StatusItem[]>([]);

  useEffect(() => {
    let mounted = true;
    fetch("/api/integrations/status")
      .then((res) => (res.ok ? res.json() : { integrations: [] }))
      .then((data) => {
        if (mounted) {
          setStatus(data.integrations ?? []);
        }
      })
      .catch(() => {
        if (mounted) setStatus([]);
      });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section className="rounded-2xl border border-white/10 bg-panel/70 p-4">
      <p className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-400">Integrations</p>
      <div className="space-y-2">
        {status.map((item) => (
          <div key={item.service} className="rounded-lg border border-white/10 bg-panelSoft/60 px-3 py-2">
            <p className="text-sm capitalize text-white">{item.service}</p>
            <p className="text-xs text-slate-400">{item.connected ? item.account ?? "Connected" : "Disconnected"}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function HeaderActions() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-400">{email ?? "Not signed in"}</span>
      <button
        type="button"
        onClick={() => void signOut()}
        className="rounded-md border border-white/20 px-3 py-1 text-xs text-slate-200"
      >
        Sign out
      </button>
    </div>
  );
}

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_15%_15%,#14304a_0%,#07121c_40%,#060d14_100%)] text-white">
      <div className="flex min-h-screen">
        <Sidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 items-center justify-between border-b border-white/10 px-6">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Resident Secretary</p>
            <HeaderActions />
          </header>

          <main className="min-w-0 flex-1 overflow-auto p-6">{children}</main>
        </div>

        <aside className="hidden w-[320px] shrink-0 border-l border-white/10 bg-panel/50 p-4 lg:block">
          <div className="space-y-4">
            <ActivityStrip />
            <IntegrationStatusCards />
            <QuickSayList />
          </div>
        </aside>
      </div>
    </div>
  );
}



