"use client";

import { useState } from "react";
import { ApprovalBanner } from "@/components/ApprovalBanner";
import { LiveTranscription } from "@/components/LiveTranscription";
import { Orb } from "@/components/Orb";
import { TaskOverlay } from "@/components/TaskOverlay";
import { useVoiceSession } from "@/context/VoiceSessionContext";

export default function HomePage() {
  const voiceEnabled = Boolean(process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY?.trim());
  const {
    sessionId,
    orbState,
    liveTranscript,
    assistantResponse,
    activity,
    errorMessage,
    startListening,
    stopListening,
    submitTranscript,
    clearError,
  } = useVoiceSession();

  const [typedCommand, setTypedCommand] = useState("");

  return (
    <div className="mx-auto grid max-w-4xl gap-4">
      <div className="rounded-xl border border-white/10 bg-panel/55 p-3 text-xs text-slate-400">
        Session ID: {sessionId}
      </div>

      <Orb state={orbState} />

      {voiceEnabled ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void startListening()}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-black"
          >
            Start Voice
          </button>
          <button
            type="button"
            onClick={() => void stopListening()}
            className="rounded-md border border-white/20 px-4 py-2 text-sm text-slate-100"
          >
            Stop Voice
          </button>
        </div>
      ) : (
        <section className="rounded-xl border border-white/10 bg-panel/55 p-3 text-xs text-slate-300">
          Voice input is disabled. Use manual transcript mode below.
        </section>
      )}

      <LiveTranscription transcript={liveTranscript} />
      <TaskOverlay items={activity} />
      <ApprovalBanner />

      <section className="rounded-2xl border border-white/10 bg-panel/60 p-4">
        <p className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-400">Assistant Response</p>
        <p className="text-sm text-slate-100">{assistantResponse || "Assistant responses appear here."}</p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-panel/60 p-4">
        <p className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-400">Manual Transcript Send</p>
        <div className="flex gap-2">
          <input
            value={typedCommand}
            onChange={(event) => setTypedCommand(event.target.value)}
            placeholder="Type transcript for testing"
            className="w-full rounded-md border border-white/20 bg-black/20 px-3 py-2 text-sm text-white"
          />
          <button
            type="button"
            onClick={() => {
              void submitTranscript(typedCommand);
              setTypedCommand("");
            }}
            className="rounded-md border border-white/20 px-4 py-2 text-sm text-slate-100"
          >
            Send
          </button>
        </div>
      </section>

      {errorMessage && (
        <section className="rounded-2xl border border-err/50 bg-err/10 p-4">
          <p className="text-sm text-red-100">{errorMessage}</p>
          <button
            type="button"
            onClick={clearError}
            className="mt-2 rounded-md border border-red-200/40 px-3 py-1 text-xs text-red-100"
          >
            Clear
          </button>
        </section>
      )}
    </div>
  );
}



