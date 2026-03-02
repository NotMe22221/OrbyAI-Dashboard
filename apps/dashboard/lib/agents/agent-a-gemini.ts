import { AgentAOutputSchema, type AgentAOutput, type IntegrationService } from "@resident-secretary/contracts";
import { ALL_SERVICES } from "../constants";
import { optionalEnv } from "../env";

function detectIntegrations(text: string): IntegrationService[] {
  const lower = text.toLowerCase();
  const matches = ALL_SERVICES.filter((service) => {
    if (service === "calendar") return lower.includes("calendar") || lower.includes("meeting");
    if (service === "gmail") return lower.includes("email") || lower.includes("gmail") || lower.includes("inbox");
    return lower.includes(service);
  });

  return matches.length > 0 ? matches : [];
}

function heuristicAgentA(transcript: string): AgentAOutput {
  const lower = transcript.toLowerCase();
  const integrations = detectIntegrations(transcript);
  const isSimpleQuestion =
    integrations.length === 0 &&
    (lower.startsWith("what") || lower.startsWith("who") || lower.startsWith("when") || lower.startsWith("how"));

  if (isSimpleQuestion) {
    return {
      intent: "simple_question",
      target_integrations: [],
      confidence: 0.58,
      inline_answer: "I can help with that. Ask me to use Gmail, Calendar, YouTube, or Notion for an exact action.",
      requires_agent_b: false,
    };
  }

  if (integrations.length > 1) {
    return {
      intent: "multi_integration",
      target_integrations: integrations,
      confidence: 0.78,
      requires_agent_b: true,
    };
  }

  if (integrations.length === 1) {
    const only = integrations[0];
    const intent = only === "calendar" ? "calendar_query" : "single_integration";
    return {
      intent,
      target_integrations: integrations,
      confidence: 0.8,
      requires_agent_b: true,
    };
  }

  return {
    intent: "unknown",
    target_integrations: [],
    confidence: 0.4,
    inline_answer: "I need a bit more detail. Tell me what action you want and which service to use.",
    requires_agent_b: false,
  };
}

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in model output.");
  }
  return JSON.parse(text.slice(start, end + 1));
}

export async function runAgentA(input: {
  transcript: string;
  sessionContext: unknown;
  userProfile: unknown;
}) {
  const started = performance.now();
  const apiKey = optionalEnv("GOOGLE_AI_API_KEY");

  if (!apiKey) {
    return {
      output: heuristicAgentA(input.transcript),
      latencyMs: Math.round(performance.now() - started),
      source: "heuristic" as const,
    };
  }

  const timeout = new AbortController();
  const timeoutHandle = setTimeout(() => timeout.abort(), 450);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: timeout.signal,
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: [
                    "Classify intent and return JSON only.",
                    "Schema: { intent, target_integrations[], confidence, inline_answer?, requires_agent_b }",
                    "Allowed integrations: gmail, calendar, youtube, notion",
                    `Transcript: ${input.transcript}`,
                    `Session context: ${JSON.stringify(input.sessionContext)}`,
                    `User profile: ${JSON.stringify(input.userProfile)}`,
                  ].join("\n"),
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Gemini request failed: ${response.status}`);
    }

    const payload = await response.json();
    const text =
      payload?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part?.text ?? "").join("\n") ?? "";

    const parsed = AgentAOutputSchema.parse(extractJson(text));
    return {
      output: parsed,
      latencyMs: Math.round(performance.now() - started),
      source: "gemini" as const,
    };
  } catch {
    return {
      output: heuristicAgentA(input.transcript),
      latencyMs: Math.round(performance.now() - started),
      source: "heuristic" as const,
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}



