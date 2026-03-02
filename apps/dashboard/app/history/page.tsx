"use client";

import { useEffect, useState } from "react";
import { SessionHistory } from "@/components/SessionHistory";

type SessionItem = {
  id: string;
  started_at: string;
  ended_at: string | null;
  summary: string | null;
};

export default function HistoryPage() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadSessions(value: string) {
    setLoading(true);
    const query = value.trim().length > 0 ? `?search=${encodeURIComponent(value)}` : "";
    const res = await fetch(`/api/history${query}`);
    const data = await res.json();
    setSessions(data.sessions ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void loadSessions("");
  }, []);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-panel/60 p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Session History</p>
        <div className="mt-3 flex gap-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search transcripts"
            className="w-full rounded-md border border-white/20 bg-black/20 px-3 py-2 text-sm text-white"
          />
          <button
            type="button"
            onClick={() => void loadSessions(search)}
            className="rounded-md border border-white/20 px-4 py-2 text-sm text-slate-100"
          >
            Search
          </button>
        </div>
        {loading && <p className="mt-2 text-xs text-slate-400">Loading sessions...</p>}
      </div>

      <SessionHistory sessions={sessions} />
    </div>
  );
}



