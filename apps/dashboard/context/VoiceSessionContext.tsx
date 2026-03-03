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
import { hasVapiPublicKey, isBrowserSpeechSupported, startVapiSession, stopVapiSession, type ASREngine } from "@/lib/vapi";
import { ALL_SERVICES } from "@/lib/constants";

export type OrbState = "idle" | "listening" | "thinking" | "speaking" | "error";
type MicPermission = "granted" | "denied" | "prompt" | "unknown";

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

type VoiceDiagnostics = {
  secureContext: boolean;
  browserSpeechSupported: boolean;
  micPermission: MicPermission;
  selectedAsr: ASREngine | null;
  lastAsrError?: string;
};

type SiteShortcut = {
  key: string;
  label: string;
  url: string;
};

type VoiceSessionContextValue = {
  sessionId: string;
  orbState: OrbState;
  liveTranscript: string;
  assistantResponse: string;
  activity: ActivityItem[];
  pendingApproval: ApprovalState;
  errorMessage: string | null;
  voiceDiagnostics: VoiceDiagnostics;
  showVoiceDebug: boolean;
  toggleVoiceDebug: () => void;
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  submitTranscript: (text: string) => Promise<void>;
  approveAction: () => Promise<void>;
  rejectAction: () => Promise<void>;
  clearError: () => void;
};

const VoiceSessionContext = createContext<VoiceSessionContextValue | null>(null);
const WELCOME_PROMPT = "What can I help you with today?";
const NO_SPEECH_TIMEOUT_MS = 10000;

const SITE_SHORTCUTS: SiteShortcut[] = [
  { key: "youtube", label: "YouTube", url: "https://www.youtube.com" },
  { key: "slack", label: "Slack", url: "https://slack.com/signin" },
  { key: "google", label: "Google", url: "https://www.google.com" },
  { key: "gmail", label: "Gmail", url: "https://mail.google.com" },
  { key: "calendar", label: "Google Calendar", url: "https://calendar.google.com" },
  { key: "notion", label: "Notion", url: "https://www.notion.so" },
  { key: "linear", label: "Linear", url: "https://linear.app" },
  { key: "github", label: "GitHub", url: "https://github.com" },
];

function findSiteShortcut(text: string) {
  const lower = text.toLowerCase();
  const trigger = /\b(open|go to|launch|take me to|navigate to)\b/.test(lower);
  if (!trigger) {
    return null;
  }
  return SITE_SHORTCUTS.find((site) => lower.includes(site.key)) ?? null;
}

function generateSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}`;
}

async function queryMicPermission(): Promise<MicPermission> {
  if (typeof navigator === "undefined" || !("permissions" in navigator)) {
    return "unknown";
  }
  try {
    const result = await (navigator as any).permissions.query({ name: "microphone" as PermissionName });
    return (result?.state as MicPermission) ?? "unknown";
  } catch {
    return "unknown";
  }
}

export function VoiceSessionProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState<string>("pending-session");
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [assistantResponse, setAssistantResponse] = useState("");
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [pendingApproval, setPendingApproval] = useState<ApprovalState>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showVoiceDebug, setShowVoiceDebug] = useState(false);
  const [voiceDiagnostics, setVoiceDiagnostics] = useState<VoiceDiagnostics>({
    secureContext: true,
    browserSpeechSupported: false,
    micPermission: "unknown",
    selectedAsr: null,
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recentContextRef = useRef<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const activeBlobUrlRef = useRef<string | null>(null);
  const pendingPlaybackRef = useRef<PendingPlayback | null>(null);
  const latestSpokenRef = useRef<string>("");
  const finalizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noSpeechTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSubmittedRef = useRef<{ text: string; at: number } | null>(null);
  const conversationModeRef = useRef<boolean>(false);
  const hasUserGestureRef = useRef<boolean>(false);
  const startListeningRef = useRef<() => Promise<void>>(async () => {});
  const hasSpokenWelcomeRef = useRef<boolean>(false);
  const welcomeAudioUrlRef = useRef<string | undefined>(undefined);

  const toggleVoiceDebug = useCallback(() => setShowVoiceDebug((prev) => !prev), []);
  const clearError = useCallback(() => setErrorMessage(null), []);

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

  const clearNoSpeechTimer = useCallback(() => {
    if (noSpeechTimerRef.current) {
      clearTimeout(noSpeechTimerRef.current);
      noSpeechTimerRef.current = null;
    }
  }, []);

  const armNoSpeechTimer = useCallback(() => {
    clearNoSpeechTimer();
    noSpeechTimerRef.current = setTimeout(() => {
      setErrorMessage("Speech timeout - no voice detected. Check microphone permission and try again.");
      pushActivity("status", "Speech timeout - no voice detected");
      setOrbState("idle");
      void stopVapiSession();
    }, NO_SPEECH_TIMEOUT_MS);
  }, [clearNoSpeechTimer, pushActivity]);

  const markUserGesture = useCallback(() => {
    hasUserGestureRef.current = true;
    setErrorMessage((prev) => {
      if (!prev) return prev;
      const lower = prev.toLowerCase();
      if (lower.includes("autoplay") || lower.includes("unable to play response audio") || lower.includes("user didn't interact")) {
        return null;
      }
      return prev;
    });
  }, []);

  useEffect(() => {
    setSessionId(generateSessionId());
    setVoiceDiagnostics((prev) => ({
      ...prev,
      secureContext: typeof window === "undefined" ? true : Boolean(window.isSecureContext || window.location.hostname === "localhost"),
      browserSpeechSupported: isBrowserSpeechSupported(),
    }));
    void queryMicPermission().then((permission) => {
      setVoiceDiagnostics((prev) => ({ ...prev, micPermission: permission }));
    });
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
      if (!src.startsWith("data:audio/") || index === -1) return undefined;
      const mime = src.slice(5, index);
      const base64 = src.slice(index + marker.length);
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
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
        // keep fallback behavior
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
    setErrorMessage(`Unable to play response audio. ${lastErrorMessage}`);
    onDone?.();
  }, []);

  const handleSSEEvent = useCallback((event: SSEEvent) => {
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
        if (!conversationModeRef.current) return;
        setTimeout(() => {
          void startListeningRef.current();
        }, 350);
      });
      if (event.voice_summary.toLowerCase().includes("session ended")) {
        setTimeout(() => resetSessionContext(), 300);
      }
      return;
    }

    if (event.type === "error") {
      setErrorMessage(event.message);
      setOrbState("error");
      pushActivity("error", event.message);
    }
  }, [playAudio, pushActivity, resetSessionContext]);

  const ensureStream = useCallback((targetSessionId?: string) => {
    if (eventSourceRef.current) return;

    const sid = targetSessionId ?? sessionId;
    const source = new EventSource(`/api/stream/${sid}`);
    source.onmessage = (messageEvent) => {
      try {
        const parsed = JSON.parse(messageEvent.data) as SSEEvent;
        handleSSEEvent(parsed);
      } catch {
        // ignore heartbeat lines
      }
    };
    source.onerror = () => setErrorMessage("SSE stream disconnected.");
    eventSourceRef.current = source;
  }, [handleSSEEvent, sessionId]);

  const handleSiteShortcut = useCallback(async (normalized: string) => {
    const site = findSiteShortcut(normalized);
    if (!site) return false;

    const responseText = `Opening ${site.label}.`;
    setAssistantResponse(responseText);
    setLiveTranscript(normalized);
    setOrbState("thinking");
    pushActivity("acting", `Opening ${site.label}`);
    recentContextRef.current = [
      ...recentContextRef.current,
      { role: "user" as const, content: normalized },
      { role: "assistant" as const, content: responseText },
    ].slice(-5);

    try {
      const popup = window.open(site.url, "_blank", "noopener,noreferrer");
      if (!popup) {
        const blocked = `Popup blocked. Use this link: ${site.url}`;
        setAssistantResponse(blocked);
        setErrorMessage("Popup was blocked by the browser. Allow popups for this site and try again.");
        await playAudio(undefined, blocked);
      } else {
        await playAudio(undefined, responseText);
      }
    } catch {
      setErrorMessage(`Unable to open ${site.label}.`);
      setOrbState("error");
    } finally {
      setOrbState("idle");
    }

    return true;
  }, [playAudio, pushActivity]);

  const submitTranscript = useCallback(async (text: string) => {
    markUserGesture();
    const normalized = text.trim();
    if (!normalized) return;

    const last = lastSubmittedRef.current;
    const now = Date.now();
    if (last && last.text === normalized && now - last.at < 2500) return;
    lastSubmittedRef.current = { text: normalized, at: now };

    if (await handleSiteShortcut(normalized)) return;

    const currentSessionId = resolveSessionId();
    ensureStream(currentSessionId);
    setOrbState("thinking");
    setLiveTranscript(normalized);
    setAssistantResponse("");
    recentContextRef.current = [
      ...recentContextRef.current,
      { role: "user" as const, content: normalized },
    ].slice(-5);

    pushActivity("status", "Speech capture ended, sending transcript");

    try {
      const response = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: currentSessionId,
          transcript: normalized,
          asr_source: voiceDiagnostics.selectedAsr ?? "browser",
          context: {
            active_integrations: ALL_SERVICES,
            recent_context: recentContextRef.current,
            user_profile: { asr_source: voiceDiagnostics.selectedAsr ?? "browser" },
            timestamp: new Date().toISOString(),
          },
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error ?? "Voice request failed");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Voice request failed";
      setOrbState("error");
      setErrorMessage(message);
      setVoiceDiagnostics((prev) => ({ ...prev, lastAsrError: message }));
    }
  }, [ensureStream, handleSiteShortcut, markUserGesture, pushActivity, resolveSessionId, voiceDiagnostics.selectedAsr]);

  const runVoicePreflight = useCallback(async () => {
    pushActivity("status", "Checking microphone permissions");
    const secureContext = typeof window === "undefined" ? true : Boolean(window.isSecureContext || window.location.hostname === "localhost");
    const browserSupported = isBrowserSpeechSupported();
    const micPermission = await queryMicPermission();
    const vapiAvailable = hasVapiPublicKey();

    const selectedAsr: ASREngine | null = browserSupported ? "browser" : (vapiAvailable ? "vapi" : null);
    setVoiceDiagnostics((prev) => ({
      ...prev,
      secureContext,
      browserSpeechSupported: browserSupported,
      micPermission,
      selectedAsr,
    }));

    if (!secureContext) {
      setErrorMessage("Microphone capture requires HTTPS in hosted mode. Use a secure URL.");
      return { ok: false };
    }
    if (micPermission === "denied") {
      setErrorMessage("Microphone permission is blocked. Allow microphone access in browser site settings.");
      return { ok: false };
    }
    if (!browserSupported && !vapiAvailable) {
      setErrorMessage("Voice input is unsupported in this browser. Use Chrome for hosted demos.");
      return { ok: false };
    }
    return { ok: true, selectedAsr };
  }, [pushActivity]);

  const startListening = useCallback(async () => {
    markUserGesture();
    const pending = pendingPlaybackRef.current;
    if (pending) {
      pendingPlaybackRef.current = null;
      void playAudio(pending.audioUrl, pending.fallbackText, pending.onDone);
    }

    const preflight = await runVoicePreflight();
    if (!preflight.ok) {
      setOrbState("error");
      return;
    }

    const currentSessionId = resolveSessionId();
    ensureStream(currentSessionId);
    conversationModeRef.current = true;
    latestSpokenRef.current = "";
    clearNoSpeechTimer();

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
        preferredEngine: preflight.selectedAsr ?? "browser",
        onEngineSelected: (engine) => {
          setVoiceDiagnostics((prev) => ({ ...prev, selectedAsr: engine, lastAsrError: undefined }));
          pushActivity("status", engine === "browser" ? "Listening (browser speech)" : "Listening (vapi speech)");
        },
        onSpeechStart: () => {
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
          }
          setOrbState("listening");
          armNoSpeechTimer();
        },
        onTranscript: ({ text, final }) => {
          clearNoSpeechTimer();
          const clean = text.trim();
          setLiveTranscript(clean);
          latestSpokenRef.current = clean;
          pushActivity("status", final ? "Speech capture ended, sending transcript" : "Listening (browser speech)");

          if (finalizeTimerRef.current) {
            clearTimeout(finalizeTimerRef.current);
            finalizeTimerRef.current = null;
          }

          if (final) {
            void submitTranscript(clean);
            return;
          }

          armNoSpeechTimer();
          finalizeTimerRef.current = setTimeout(() => {
            const latest = latestSpokenRef.current.trim();
            if (latest) {
              void submitTranscript(latest);
            }
          }, 1200);
        },
        onError: (message) => {
          clearNoSpeechTimer();
          setVoiceDiagnostics((prev) => ({ ...prev, lastAsrError: message }));
          setErrorMessage(message);
          setOrbState("error");
          pushActivity("error", message);
        },
      });

      if (started) {
        setOrbState("listening");
      } else {
        setOrbState("idle");
        conversationModeRef.current = false;
      }
    } catch (error) {
      clearNoSpeechTimer();
      const message = error instanceof Error ? error.message : "Unable to start voice session.";
      setVoiceDiagnostics((prev) => ({ ...prev, lastAsrError: message }));
      setErrorMessage(message);
      setOrbState("error");
      conversationModeRef.current = false;
    }
  }, [armNoSpeechTimer, clearNoSpeechTimer, ensureStream, markUserGesture, playAudio, pushActivity, resolveSessionId, runVoicePreflight, submitTranscript]);

  const stopListening = useCallback(async () => {
    markUserGesture();
    conversationModeRef.current = false;
    clearNoSpeechTimer();
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
  }, [clearNoSpeechTimer, markUserGesture, submitTranscript]);

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
        // best effort prefetch only
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      conversationModeRef.current = false;
      clearNoSpeechTimer();
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
  }, [clearNoSpeechTimer]);

  const value = useMemo<VoiceSessionContextValue>(() => ({
    sessionId,
    orbState,
    liveTranscript,
    assistantResponse,
    activity,
    pendingApproval,
    errorMessage,
    voiceDiagnostics,
    showVoiceDebug,
    toggleVoiceDebug,
    startListening,
    stopListening,
    submitTranscript,
    approveAction,
    rejectAction,
    clearError,
  }), [
    sessionId,
    orbState,
    liveTranscript,
    assistantResponse,
    activity,
    pendingApproval,
    errorMessage,
    voiceDiagnostics,
    showVoiceDebug,
    toggleVoiceDebug,
    startListening,
    stopListening,
    submitTranscript,
    approveAction,
    rejectAction,
    clearError,
  ]);

  return <VoiceSessionContext.Provider value={value}>{children}</VoiceSessionContext.Provider>;
}

export function useVoiceSession() {
  const ctx = useContext(VoiceSessionContext);
  if (!ctx) {
    throw new Error("useVoiceSession must be used within VoiceSessionProvider");
  }
  return ctx;
}

