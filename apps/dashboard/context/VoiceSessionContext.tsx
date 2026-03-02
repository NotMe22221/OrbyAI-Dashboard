"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { SSEEvent } from "@resident-secretary/contracts";
import { startVapiSession, stopVapiSession } from "@/lib/vapi";
import { ALL_SERVICES } from "@/lib/constants";

export type OrbState = "idle" | "listening" | "thinking" | "speaking" | "error";

type ActivityItem = {
  id: string;
  message: string;
  step: string;
  createdAt: string;
};

type ApprovalState = {
  action: string;
  preview: string;
} | null;

type VoiceSessionContextValue = {
  sessionId: string;
  orbState: OrbState;
  liveTranscript: string;
  assistantResponse: string;
  activity: ActivityItem[];
  pendingApproval: ApprovalState;
  errorMessage: string | null;
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  submitTranscript: (text: string) => Promise<void>;
  approveAction: () => Promise<void>;
  rejectAction: () => Promise<void>;
  clearError: () => void;
};

const VoiceSessionContext = createContext<VoiceSessionContextValue | null>(null);

function generateSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}`;
}

export function VoiceSessionProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState<string>(() => generateSessionId());
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [assistantResponse, setAssistantResponse] = useState("");
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [pendingApproval, setPendingApproval] = useState<ApprovalState>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recentContextRef = useRef<Array<{ role: "user" | "assistant"; content: string }>>([]);

  const clearError = useCallback(() => setErrorMessage(null), []);

  const resetSessionContext = useCallback(() => {
    recentContextRef.current = [];
    setLiveTranscript("");
    setAssistantResponse("");
    setPendingApproval(null);
    setActivity([]);
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setSessionId(generateSessionId());
    setOrbState("idle");
  }, []);

  const pushActivity = useCallback((message: string, step: string) => {
    setActivity((prev) => [
      {
        id: `${Date.now()}-${Math.random()}`,
        message,
        step,
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ].slice(0, 40));
  }, []);

  const playAudio = useCallback(async (audioUrl?: string) => {
    if (!audioUrl) {
      setOrbState("idle");
      return;
    }

    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      setOrbState("speaking");

      audio.onended = () => {
        setOrbState("idle");
      };

      await audio.play();
    } catch {
      setOrbState("error");
      setErrorMessage("Unable to play response audio.");
    }
  }, []);

  const handleSSEEvent = useCallback(
    (event: SSEEvent) => {
      if (event.type === "status") {
        pushActivity(event.message, event.step);
        setOrbState(event.message === "thinking" ? "thinking" : "thinking");
        return;
      }

      if (event.type === "approval") {
        setPendingApproval({ action: event.action, preview: event.preview });
        pushActivity("approval", `Awaiting confirmation for ${event.action}`);
        setOrbState("idle");
        return;
      }

      if (event.type === "complete") {
        const text = event.response_text ?? event.voice_summary;
        setAssistantResponse(text);
        recentContextRef.current = [
          ...recentContextRef.current,
          { role: "assistant" as const, content: text },
        ].slice(-5);
        setPendingApproval(null);
        pushActivity("complete", "Completed response");
        void playAudio(event.audio_url);
        if (event.voice_summary.toLowerCase().includes("session ended")) {
          setTimeout(() => {
            resetSessionContext();
          }, 300);
        }
        return;
      }

      if (event.type === "error") {
        setErrorMessage(event.message);
        setOrbState("error");
      }
    },
    [playAudio, pushActivity, resetSessionContext],
  );

  const ensureStream = useCallback(() => {
    if (eventSourceRef.current) {
      return;
    }

    const source = new EventSource(`/api/stream/${sessionId}`);
    source.onmessage = (messageEvent) => {
      try {
        const parsed = JSON.parse(messageEvent.data) as SSEEvent;
        handleSSEEvent(parsed);
      } catch {
        // ignore malformed heartbeat lines
      }
    };
    source.onerror = () => {
      setErrorMessage("SSE stream disconnected.");
    };

    eventSourceRef.current = source;
  }, [handleSSEEvent, sessionId]);

  const submitTranscript = useCallback(
    async (text: string) => {
      if (!text.trim()) {
        return;
      }

      ensureStream();
      setOrbState("thinking");
      setLiveTranscript(text);
      setAssistantResponse("");
      recentContextRef.current = [
        ...recentContextRef.current,
        { role: "user" as const, content: text },
      ].slice(-5);

      try {
        const response = await fetch("/api/voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionId,
            transcript: text,
            context: {
              active_integrations: ALL_SERVICES,
              recent_context: recentContextRef.current,
              user_profile: {},
              timestamp: new Date().toISOString(),
            },
          }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error ?? "Voice request failed");
        }
      } catch (error) {
        setOrbState("error");
        setErrorMessage(error instanceof Error ? error.message : "Voice request failed");
      }
    },
    [ensureStream, sessionId],
  );

  const startListening = useCallback(async () => {
    ensureStream();

    try {
      const started = await startVapiSession({
        onSpeechStart: () => {
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
          }
          setOrbState("listening");
        },
        onTranscript: ({ text, final }) => {
          setLiveTranscript(text);
          if (final) {
            void submitTranscript(text);
          }
        },
        onError: (message) => {
          setErrorMessage(message);
          setOrbState("error");
        },
      });
      if (started) {
        setOrbState("listening");
      } else {
        setOrbState("idle");
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to start Vapi session.");
      setOrbState("error");
    }
  }, [ensureStream, submitTranscript]);

  const stopListening = useCallback(async () => {
    await stopVapiSession();
    setOrbState("idle");
  }, []);

  const approveAction = useCallback(async () => {
    await submitTranscript("yes");
  }, [submitTranscript]);

  const rejectAction = useCallback(async () => {
    await submitTranscript("cancel");
  }, [submitTranscript]);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
      void stopVapiSession();
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  const value = useMemo<VoiceSessionContextValue>(
    () => ({
      sessionId,
      orbState,
      liveTranscript,
      assistantResponse,
      activity,
      pendingApproval,
      errorMessage,
      startListening,
      stopListening,
      submitTranscript,
      approveAction,
      rejectAction,
      clearError,
    }),
    [
      activity,
      approveAction,
      assistantResponse,
      clearError,
      errorMessage,
      liveTranscript,
      orbState,
      pendingApproval,
      rejectAction,
      sessionId,
      startListening,
      stopListening,
      submitTranscript,
    ],
  );

  return <VoiceSessionContext.Provider value={value}>{children}</VoiceSessionContext.Provider>;
}

export function useVoiceSession() {
  const ctx = useContext(VoiceSessionContext);
  if (!ctx) {
    throw new Error("useVoiceSession must be used within VoiceSessionProvider");
  }
  return ctx;
}



