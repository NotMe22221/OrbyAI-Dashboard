"use client";

export function LiveTranscription({ transcript }: { transcript: string }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-panel/60 p-4">
      <p className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-400">Live Transcription</p>
      <p className="min-h-16 text-sm leading-relaxed text-slate-100">
        {transcript || "Speak to begin. Partial and final transcript appears here in real-time."}
      </p>
    </section>
  );
}



