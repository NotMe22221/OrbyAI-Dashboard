import { z } from "zod";

export const VoiceRequestSchema = z.object({
  session_id: z.string().uuid(),
  transcript: z.string().min(1),
  asr_source: z.enum(["browser", "vapi"]).optional(),
  context: z.object({
    active_integrations: z.array(
      z.enum(["gmail", "calendar", "youtube", "slack", "linear", "notion"]),
    ),
    recent_context: z.array(z.unknown()),
    user_profile: z.record(z.unknown()),
    timestamp: z.string(),
  }),
});

export type VoiceRequest = z.infer<typeof VoiceRequestSchema>;


