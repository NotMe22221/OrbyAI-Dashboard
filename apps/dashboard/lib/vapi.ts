"use client";

type TranscriptHandler = (payload: { text: string; final: boolean }) => void;
type VoidHandler = () => void;

let vapiClient: any;
let cleanupFns: Array<() => void> = [];

async function getClient() {
  if (typeof window === "undefined") {
    return null;
  }

  if (!vapiClient) {
    const publicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY ?? process.env.VAPI_PUBLIC_KEY;
    if (!publicKey) {
      return null;
    }

    const mod = await import("@vapi-ai/web");
    const VapiCtor = (mod as any).default ?? (mod as any).Vapi;
    vapiClient = new VapiCtor(publicKey);
  }

  return vapiClient;
}

function normalizeTranscript(message: any): { text: string; final: boolean } | null {
  const text =
    message?.transcript ??
    message?.text ??
    message?.conversation?.transcript ??
    message?.data?.transcript ??
    "";

  if (!text || typeof text !== "string") {
    return null;
  }

  const final =
    Boolean(message?.final) ||
    Boolean(message?.isFinal) ||
    message?.type === "transcript-final" ||
    message?.type === "final-transcript";

  return { text, final };
}

export async function initializeVapi() {
  return getClient();
}

export async function startVapiSession(args: {
  onTranscript: TranscriptHandler;
  onSpeechStart: VoidHandler;
  onError: (message: string) => void;
}) {
  const client = await getClient();
  if (!client) {
    args.onError("Voice input via Vapi is disabled.");
    return false;
  }

  const onMessage = (message: any) => {
    const normalized = normalizeTranscript(message);
    if (normalized) {
      args.onTranscript(normalized);
    }
  };

  const onSpeechStart = () => args.onSpeechStart();
  const onError = (error: any) => args.onError(error?.message ?? "Vapi error");

  client.on?.("message", onMessage);
  client.on?.("speech-start", onSpeechStart);
  client.on?.("error", onError);

  cleanupFns.push(() => client.off?.("message", onMessage));
  cleanupFns.push(() => client.off?.("speech-start", onSpeechStart));
  cleanupFns.push(() => client.off?.("error", onError));

  await client.start?.();
  return true;
}

export async function stopVapiSession() {
  const client = await getClient();
  if (!client) {
    return;
  }

  await client.stop?.();
  for (const clean of cleanupFns) {
    clean();
  }
  cleanupFns = [];
}



