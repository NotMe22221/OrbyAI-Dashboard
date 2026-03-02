import { optionalEnv } from "../env";

function toBase64(buffer: ArrayBuffer) {
  return Buffer.from(buffer).toString("base64");
}

let cachedVoiceId: string | undefined;

async function resolveVoiceId(apiKey: string) {
  if (cachedVoiceId) {
    return cachedVoiceId;
  }

  const configured = optionalEnv("ELEVENLABS_VOICE_ID") ?? optionalEnv("ELEVENLABS_AGENT_ID");
  if (configured && !configured.startsWith("agent_")) {
    cachedVoiceId = configured;
    return configured;
  }

  const voicesRes = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: {
      "xi-api-key": apiKey,
    },
  });

  if (!voicesRes.ok) {
    return undefined;
  }

  const voicesPayload = await voicesRes.json();
  const voiceId = voicesPayload?.voices?.[0]?.voice_id as string | undefined;
  if (voiceId) {
    cachedVoiceId = voiceId;
  }
  return voiceId;
}

export async function synthesizeVoiceSummary(summary: string) {
  const apiKey = optionalEnv("ELEVENLABS_API_KEY");
  if (!apiKey || !summary?.trim()) {
    return undefined;
  }

  const voiceId = await resolveVoiceId(apiKey);
  if (!voiceId) {
    return undefined;
  }

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: summary.slice(0, 300),
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    }),
  });

  if (!res.ok) {
    return undefined;
  }

  const audio = await res.arrayBuffer();
  return `data:audio/mpeg;base64,${toBase64(audio)}`;
}
