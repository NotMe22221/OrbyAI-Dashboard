"use client";

import { useState } from "react";
import { ApprovalBanner } from "@/components/ApprovalBanner";
import { LiveTranscription } from "@/components/LiveTranscription";
import { Orb } from "@/components/Orb";
import { TaskOverlay } from "@/components/TaskOverlay";
import { useVoiceSession } from "@/context/VoiceSessionContext";

export default function HomePage() {
  const {
    sessionId,
    orbState,
    liveTranscript,
    assistantResponse,
    activity,
    errorMessage,
    voiceDiagnostics,
    showVoiceDebug,
    toggleVoiceDebug,
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

      <div className="flex items-center gap-2">
        <span className="rounded-md border border-white/15 bg-black/20 px-2 py-1 text-xs text-slate-200">
          Mic: {voiceDiagnostics.micPermission === "granted" ? "Ready" : voiceDiagnostics.micPermission === "denied" ? "Blocked" : voiceDiagnostics.micPermission === "prompt" ? "Permission Needed" : "Unknown"}
        </span>
        <span className="rounded-md border border-white/15 bg-black/20 px-2 py-1 text-xs text-slate-200">
          ASR: {voiceDiagnostics.selectedAsr ?? "Not selected"}
        </span>
        <span className="rounded-md border border-white/15 bg-black/20 px-2 py-1 text-xs text-slate-200">
          Browser Speech: {voiceDiagnostics.browserSpeechSupported ? "Supported" : "Unsupported"}
        </span>
        <button
          type="button"
          onClick={toggleVoiceDebug}
          className="rounded-md border border-white/20 px-2 py-1 text-xs text-slate-100"
        >
          {showVoiceDebug ? "Hide Debug" : "Show Debug"}
        </button>
      </div>

      <Orb state={orbState} />

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

      {showVoiceDebug && (
        <section className="rounded-2xl border border-white/10 bg-panel/60 p-4">
          <p className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-400">Voice Debug</p>
          <pre className="whitespace-pre-wrap text-xs text-slate-200">
            {JSON.stringify(voiceDiagnostics, null, 2)}
          </pre>
        </section>
      )}
    </div>
  );
}



