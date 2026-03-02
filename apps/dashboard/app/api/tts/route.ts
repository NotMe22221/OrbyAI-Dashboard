import { NextResponse } from "next/server";
import { synthesizeVoiceSummary } from "@/lib/tts/elevenlabs";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const text = String(payload?.text ?? "").trim();

  if (!text) {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }

  const audioUrl = await synthesizeVoiceSummary(text.slice(0, 300));
  if (!audioUrl) {
    return NextResponse.json({ error: "Unable to synthesize ElevenLabs audio" }, { status: 502 });
  }

  return NextResponse.json({ audio_url: audioUrl });
}
