"use client";

import { useState } from "react";

type SessionListItem = {
  id: string;
  started_at: string;
  ended_at: string | null;
  summary: string | null;
};

type SessionDetail = {
  session: SessionListItem & { user_id?: string };
  messages: Array<{ id: string; role: string; content: string; voice_summary?: string; created_at: string }>;
  actions: Array<{ id: string; service: string; operation: string; approved: boolean; executed_at: string; result: unknown }>;
};

export function SessionHistory({ sessions }: { sessions: SessionListItem[] }) {
  const [selected, setSelected] = useState<SessionDetail | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function openSession(id: string) {
    setLoadingId(id);
    const res = await fetch(`/api/history/${id}`);
    const data = await res.json();
    setSelected(data);
    setLoadingId(null);
  }

  function exportPlainText() {
    if (!selected) return;
    const body = [
      `Session: ${selected.session.id}`,
      `Started: ${selected.session.started_at}`,
      "",
      "Transcript:",
      ...selected.messages.map((m) => `[${m.created_at}] ${m.role}: ${m.content}`),
      "",
      "Actions:",
      ...selected.actions.map((a) => `[${a.executed_at}] ${a.service}.${a.operation} approved=${a.approved}`),
    ].join("\n");

    const blob = new Blob([body], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `session-${selected.session.id}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <section className="space-y-2 rounded-2xl border border-white/10 bg-panel/60 p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Sessions</p>
        {sessions.map((session) => (
          <button
            key={session.id}
            type="button"
            onClick={() => void openSession(session.id)}
            className="w-full rounded-lg border border-white/10 bg-panelSoft/60 px-3 py-2 text-left"
          >
            <p className="text-sm text-white">{session.summary ?? "No summary"}</p>
            <p className="text-xs text-slate-400">{new Date(session.started_at).toLocaleString()}</p>
            {loadingId === session.id && <p className="text-xs text-accent">Loading…</p>}
          </button>
        ))}
      </section>

      <section className="rounded-2xl border border-white/10 bg-panel/60 p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Session Detail</p>
          {selected && (
            <button
              type="button"
              onClick={exportPlainText}
              className="rounded-md border border-white/20 px-3 py-1 text-xs text-slate-100"
            >
              Export TXT
            </button>
          )}
        </div>

        {!selected ? (
          <p className="text-sm text-slate-400">Select a session to view transcript and actions.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-semibold text-white">Transcript</p>
              <div className="max-h-96 space-y-2 overflow-auto pr-1">
                {selected.messages.map((m) => (
                  <div key={m.id} className="rounded-lg border border-white/10 bg-black/20 p-2">
                    <p className="text-xs uppercase tracking-[0.13em] text-slate-400">{m.role}</p>
                    <p className="text-sm text-slate-200">{m.content}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-white">Action Log</p>
              <div className="max-h-96 space-y-2 overflow-auto pr-1">
                {selected.actions.map((a) => (
                  <div key={a.id} className="rounded-lg border border-white/10 bg-black/20 p-2">
                    <p className="text-xs uppercase tracking-[0.13em] text-slate-400">
                      {a.service} · {a.operation}
                    </p>
                    <p className="text-sm text-slate-200">Approved: {a.approved ? "yes" : "no"}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}



