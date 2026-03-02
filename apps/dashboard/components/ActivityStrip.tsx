"use client";

import { useVoiceSession } from "@/context/VoiceSessionContext";

export function ActivityStrip() {
  const { activity } = useVoiceSession();

  return (
    <section className="rounded-2xl border border-white/10 bg-panel/70 p-4">
      <p className="mb-3 text-xs uppercase tracking-[0.2em] text-slate-400">Activity Strip</p>
      <div className="max-h-72 space-y-2 overflow-auto pr-1">
        {activity.length === 0 ? (
          <p className="text-sm text-slate-400">Waiting for the first action.</p>
        ) : (
          activity.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-white/10 bg-panelSoft/60 px-3 py-2">
              <p className="text-xs uppercase tracking-[0.15em] text-slate-400">{entry.message}</p>
              <p className="text-sm text-slate-100">{entry.step}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}



