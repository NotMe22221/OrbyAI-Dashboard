import { NextResponse } from "next/server";
import { optionalEnv } from "@/lib/env";

export const runtime = "nodejs";

export async function GET() {
  const vapiAvailable = Boolean(optionalEnv("NEXT_PUBLIC_VAPI_PUBLIC_KEY") ?? optionalEnv("VAPI_PUBLIC_KEY"));
  const ttsAvailable = Boolean(optionalEnv("ELEVENLABS_API_KEY"));
  const agentA = optionalEnv("GOOGLE_AI_API_KEY") ? "gemini" : "heuristic";
  const agentB = optionalEnv("ANTHROPIC_API_KEY") ? "claude" : "heuristic";

  return NextResponse.json({
    asr_mode: "browser_primary",
    vapi_available: vapiAvailable,
    tts_available: ttsAvailable,
    llm: {
      agent_a: agentA,
      agent_b: agentB,
    },
    timestamp: new Date().toISOString(),
  });
}

