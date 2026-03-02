import { z } from "zod";

export const SSEStatusEventSchema = z.object({
  type: z.literal("status"),
  message: z.string(),
  step: z.string(),
});

export const SSEApprovalEventSchema = z.object({
  type: z.literal("approval"),
  action: z.string(),
  preview: z.string(),
});

export const SSECompleteEventSchema = z.object({
  type: z.literal("complete"),
  voice_summary: z.string(),
  audio_url: z.string().optional(),
  response_text: z.string().optional(),
});

export const SSEErrorEventSchema = z.object({
  type: z.literal("error"),
  message: z.string(),
});

export const SSEEventSchema = z.union([
  SSEStatusEventSchema,
  SSEApprovalEventSchema,
  SSECompleteEventSchema,
  SSEErrorEventSchema,
]);

export type SSEEvent = z.infer<typeof SSEEventSchema>;


