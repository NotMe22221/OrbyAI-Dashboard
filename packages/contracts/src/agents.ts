import { z } from "zod";

export const IntegrationServiceSchema = z.enum([
  "gmail",
  "calendar",
  "youtube",
  "slack",
  "linear",
  "notion",
]);

export type IntegrationService = z.infer<typeof IntegrationServiceSchema>;

export const AgentAOutputSchema = z.object({
  intent: z.string(),
  target_integrations: z.array(IntegrationServiceSchema),
  confidence: z.number().min(0).max(1),
  inline_answer: z.string().optional(),
  requires_agent_b: z.boolean(),
});

export const AgentBActionSchema = z.object({
  service: IntegrationServiceSchema,
  operation: z.string(),
  params: z.record(z.unknown()),
  requires_approval: z.boolean(),
});

export const AgentBOutputSchema = z.object({
  response_text: z.string(),
  voice_summary: z.string().max(300),
  actions: z.array(AgentBActionSchema),
  follow_up_question: z.string().optional(),
});

export type AgentAOutput = z.infer<typeof AgentAOutputSchema>;
export type AgentBOutput = z.infer<typeof AgentBOutputSchema>;
export type AgentBAction = z.infer<typeof AgentBActionSchema>;


