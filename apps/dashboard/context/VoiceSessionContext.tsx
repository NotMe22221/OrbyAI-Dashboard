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

type PendingPlayback = {
  audioUrl?: string;
  fallbackText?: string;
  onDone?: () => void;
};

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
const WELCOME_PROMPT = "What can I help you with today?";

function generateSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}`;
}

export function VoiceSessionProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState<string>("pending-session");
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [assistantResponse, setAssistantResponse] = useState("");
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [pendingApproval, setPendingApproval] = useState<ApprovalState>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recentContextRef = useRef<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const activeBlobUrlRef = useRef<string | null>(null);
  const pendingPlaybackRef = useRef<PendingPlayback | null>(null);
  const latestSpokenRef = useRef<string>("");
  const finalizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSubmittedRef = useRef<{ text: string; at: number } | null>(null);
  const conversationModeRef = useRef<boolean>(false);
  const hasUserGestureRef = useRef<boolean>(false);
  const startListeningRef = useRef<() => Promise<void>>(async () => {});
  const hasSpokenWelcomeRef = useRef<boolean>(false);
  const welcomeAudioUrlRef = useRef<string | undefined>(undefined);

  const clearError = useCallback(() => setErrorMessage(null), []);
  const markUserGesture = useCallback(() => {
    hasUserGestureRef.current = true;
    setErrorMessage((prev) => {
      if (!prev) {
        return prev;
      }
      const lower = prev.toLowerCase();
      if (lower.includes("autoplay") || lower.includes("unable to play response audio") || lower.includes("user didn't interact")) {
        return null;
      }
      return prev;
    });
  }, []);

  useEffect(() => {
    setSessionId(generateSessionId());
  }, []);

  const resolveSessionId = useCallback(() => {
    if (sessionId !== "pending-session") {
      return sessionId;
    }

    const fresh = generateSessionId();
    setSessionId(fresh);
    return fresh;
  }, [sessionId]);

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

  const playAudio = useCallback(async (audioUrl?: string, fallbackText?: string, onDone?: () => void) => {
    const releaseBlobUrl = () => {
      if (activeBlobUrlRef.current) {
        URL.revokeObjectURL(activeBlobUrlRef.current);
        activeBlobUrlRef.current = null;
      }
    };

    const toBlobUrl = (src: string) => {
      const marker = ";base64,";
      const index = src.indexOf(marker);
      if (!src.startsWith("data:audio/") || index === -1) {
        return undefined;
      }

      const mime = src.slice(5, index);
      const base64 = src.slice(index + marker.length);
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return URL.createObjectURL(new Blob([bytes], { type: mime || "audio/mpeg" }));
    };

    if (!hasUserGestureRef.current) {
      pendingPlaybackRef.current = { audioUrl, fallbackText, onDone };
      setOrbState("idle");
      setErrorMessage("Audio is ready. Click Start Voice once to enable playback.");
      onDone?.();
      return;
    }

    let resolvedAudio = audioUrl;
    if (!resolvedAudio && fallbackText?.trim()) {
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: fallbackText.trim().slice(0, 300) }),
        });
        const payload = await res.json().catch(() => ({}));
        if (res.ok && payload?.audio_url) {
          resolvedAudio = payload.audio_url as string;
        }
      } catch {
        // continue with no audio
      }
    }

    if (!resolvedAudio) {
      setOrbState("idle");
      setErrorMessage("No ElevenLabs audio returned.");
      onDone?.();
      return;
    }

    const candidates: string[] = [resolvedAudio];
    const blobUrl = toBlobUrl(resolvedAudio);
    if (blobUrl) {
      candidates.push(blobUrl);
      activeBlobUrlRef.current = blobUrl;
    }

    let lastErrorMessage = "";
    for (const src of candidates) {
      try {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }

        const audio = new Audio(src);
        audioRef.current = audio;
        setOrbState("speaking");

        audio.onended = () => {
          setOrbState("idle");
          releaseBlobUrl();
          onDone?.();
        };

        await audio.play();
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : "play_failed";
        const lower = message.toLowerCase();
        if (lower.includes("notallowed") || lower.includes("didn't interact")) {
          pendingPlaybackRef.current = { audioUrl: resolvedAudio, fallbackText, onDone };
          releaseBlobUrl();
          setOrbState("idle");
          setErrorMessage("Audio playback is blocked by browser autoplay. Click Start Voice once, then try again.");
          onDone?.();
          return;
        }
        lastErrorMessage = message;
      }
    }

    releaseBlobUrl();
    setOrbState("error");
    if (lastErrorMessage.toLowerCase().includes("notallowed")) {
      setErrorMessage("Audio playback is blocked by browser autoplay. Click Start Voice and try again.");
    } else {
      setErrorMessage(`Unable to play response audio. ${lastErrorMessage}`);
    }
    onDone?.();
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
        void playAudio(event.audio_url, text, () => {
          if (!conversationModeRef.current) {
            return;
          }
          setTimeout(() => {
            void startListeningRef.current();
          }, 350);
        });
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

  const ensureStream = useCallback((targetSessionId?: string) => {
    if (eventSourceRef.current) {
      return;
    }

    const sid = targetSessionId ?? sessionId;
    const source = new EventSource(`/api/stream/${sid}`);
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
      markUserGesture();
      const normalized = text.trim();
      if (!normalized) {
        return;
      }

      const last = lastSubmittedRef.current;
      const now = Date.now();
      if (last && last.text === normalized && now - last.at < 2500) {
        return;
      }
      lastSubmittedRef.current = { text: normalized, at: now };

      const currentSessionId = resolveSessionId();
      ensureStream(currentSessionId);
      setOrbState("thinking");
      setLiveTranscript(normalized);
      setAssistantResponse("");
      recentContextRef.current = [
        ...recentContextRef.current,
        { role: "user" as const, content: normalized },
      ].slice(-5);

      try {
        const response = await fetch("/api/voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: currentSessionId,
            transcript: normalized,
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
    [ensureStream, markUserGesture, resolveSessionId],
  );

  const startListening = useCallback(async () => {
    markUserGesture();
    const pending = pendingPlaybackRef.current;
    if (pending) {
      pendingPlaybackRef.current = null;
      void playAudio(pending.audioUrl, pending.fallbackText, pending.onDone);
    }

    const currentSessionId = resolveSessionId();
    ensureStream(currentSessionId);
    conversationModeRef.current = true;
    latestSpokenRef.current = "";
    if (finalizeTimerRef.current) {
      clearTimeout(finalizeTimerRef.current);
      finalizeTimerRef.current = null;
    }

    if (!hasSpokenWelcomeRef.current) {
      hasSpokenWelcomeRef.current = true;
      setAssistantResponse(WELCOME_PROMPT);
      await new Promise<void>((resolve) => {
        void playAudio(welcomeAudioUrlRef.current, WELCOME_PROMPT, resolve);
      });
    }

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
          const clean = text.trim();
          setLiveTranscript(clean);
          latestSpokenRef.current = clean;

          if (finalizeTimerRef.current) {
            clearTimeout(finalizeTimerRef.current);
            finalizeTimerRef.current = null;
          }

          if (final) {
            void submitTranscript(clean);
            return;
          }

          finalizeTimerRef.current = setTimeout(() => {
            const latest = latestSpokenRef.current.trim();
            if (latest) {
              void submitTranscript(latest);
            }
          }, 1200);
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
        conversationModeRef.current = false;
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to start Vapi session.");
      setOrbState("error");
      conversationModeRef.current = false;
    }
  }, [ensureStream, markUserGesture, playAudio, resolveSessionId, submitTranscript]);

  const stopListening = useCallback(async () => {
    markUserGesture();
    conversationModeRef.current = false;
    if (finalizeTimerRef.current) {
      clearTimeout(finalizeTimerRef.current);
      finalizeTimerRef.current = null;
    }
    const latest = latestSpokenRef.current.trim();
    if (latest) {
      void submitTranscript(latest);
    }
    await stopVapiSession();
    setOrbState("idle");
  }, [markUserGesture, submitTranscript]);

  const approveAction = useCallback(async () => {
    markUserGesture();
    await submitTranscript("yes");
  }, [markUserGesture, submitTranscript]);

  const rejectAction = useCallback(async () => {
    markUserGesture();
    await submitTranscript("cancel");
  }, [markUserGesture, submitTranscript]);

  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  useEffect(() => {
    setAssistantResponse(WELCOME_PROMPT);
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: WELCOME_PROMPT.slice(0, 300) }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && payload?.audio_url) {
          welcomeAudioUrlRef.current = String(payload.audio_url);
        }
      } catch {
        // Best-effort prefetch only.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      conversationModeRef.current = false;
      if (finalizeTimerRef.current) {
        clearTimeout(finalizeTimerRef.current);
        finalizeTimerRef.current = null;
      }
      eventSourceRef.current?.close();
      void stopVapiSession();
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (activeBlobUrlRef.current) {
        URL.revokeObjectURL(activeBlobUrlRef.current);
        activeBlobUrlRef.current = null;
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



