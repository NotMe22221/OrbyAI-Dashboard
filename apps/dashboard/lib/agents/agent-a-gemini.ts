import { AgentAOutputSchema, type AgentAOutput, type IntegrationService } from "@resident-secretary/contracts";
import { ALL_SERVICES } from "../constants";
import { optionalEnv } from "../env";

const OPEN_SITE_PATTERNS = [
  "open youtube",
  "go to youtube",
  "open google",
  "go to google",
  "open notion",
  "go to notion",
  "open gmail",
  "go to gmail",
  "open calendar",
  "go to calendar",
];

function detectIntegrations(text: string): IntegrationService[] {
  const lower = text.toLowerCase();
  const matches = ALL_SERVICES.filter((service) => {
    if (service === "calendar") return lower.includes("calendar") || lower.includes("meeting");
    if (service === "gmail") return lower.includes("email") || lower.includes("gmail") || lower.includes("inbox");
    if (service === "youtube") return lower.includes("youtube") || lower.includes("video");
    if (service === "notion") return lower.includes("notion") || lower.includes("doc") || lower.includes("page");
    return lower.includes(service);
  });

  return matches.length > 0 ? matches : [];
}

function normalizeIntent(transcript: string, integrations: IntegrationService[]) {
  const lower = transcript.toLowerCase();

  if (OPEN_SITE_PATTERNS.some((pattern) => lower.includes(pattern))) {
    return "open_site";
  }
  if (/(latest|recent).*(email|gmail|inbox)|(email|gmail|inbox).*(latest|recent)/.test(lower)) {
    return "read_latest_email";
  }
  if (/(upcoming|today|tomorrow).*(calendar|meeting|event)|(calendar|meeting|event).*(upcoming|today|tomorrow)/.test(lower)) {
    return "calendar_schedule_query";
  }
  if (/(find|search).*(youtube|video)|(youtube|video).*(find|search)/.test(lower)) {
    return "youtube_search";
  }
  if (/(notion|page|doc).*(find|search|show)|(find|search|show).*(notion|page|doc)/.test(lower)) {
    return "notion_lookup";
  }
  if (integrations.length > 1) {
    return "multi_integration";
  }
  if (integrations.length === 1) {
    return "single_integration";
  }
  return "unknown";
}

function normalizeOutput(transcript: string, output: AgentAOutput): AgentAOutput {
  const integrations = detectIntegrations(transcript);
  const normalizedIntent = normalizeIntent(transcript, integrations);
  const fallbackIntent = output.intent.trim().toLowerCase() || normalizedIntent;
  const confidence = Number.isFinite(output.confidence) ? Math.min(1, Math.max(0, output.confidence)) : 0.65;
  const target = output.target_integrations.length > 0 ? output.target_integrations : integrations;

  const shouldUseAgentB =
    output.requires_agent_b ||
    target.length > 0 ||
    normalizedIntent !== "unknown" ||
    fallbackIntent.includes("integration");

  if (!shouldUseAgentB && (!output.inline_answer || output.inline_answer.trim().length === 0)) {
    return {
      intent: "clarify",
      target_integrations: target,
      confidence: Math.max(confidence, 0.6),
      inline_answer: "Tell me what you want me to do and which service to use, for example: read latest emails or list today’s calendar events.",
      requires_agent_b: false,
    };
  }

  return {
    intent: normalizedIntent === "unknown" ? fallbackIntent : normalizedIntent,
    target_integrations: target,
    confidence: shouldUseAgentB ? Math.max(confidence, 0.72) : confidence,
    inline_answer: output.inline_answer,
    requires_agent_b: shouldUseAgentB,
  };
}

function heuristicAgentA(transcript: string): AgentAOutput {
  const lower = transcript.toLowerCase();
  const integrations = detectIntegrations(transcript);
  const intent = normalizeIntent(transcript, integrations);
  const isSimpleQuestion =
    integrations.length === 0 &&
    (lower.startsWith("what") || lower.startsWith("who") || lower.startsWith("when") || lower.startsWith("how"));

  if (intent === "open_site") {
    return {
      intent,
      target_integrations: integrations,
      confidence: 0.92,
      requires_agent_b: true,
    };
  }

  if (isSimpleQuestion) {
    return {
      intent: "simple_question",
      target_integrations: [],
      confidence: 0.64,
      inline_answer: "I can help. If you want live data, tell me which service to use, like Gmail, Calendar, YouTube, or Notion.",
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
    return {
      intent,
      target_integrations: integrations,
      confidence: 0.86,
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
    const heuristic = heuristicAgentA(input.transcript);
    return {
      output: normalizeOutput(input.transcript, heuristic),
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
                    "Classify intent for a voice assistant and return JSON only.",
                    "Schema: { intent, target_integrations[], confidence, inline_answer?, requires_agent_b }",
                    "Allowed integrations: gmail, calendar, youtube, notion",
                    "Prefer requires_agent_b=true for actionable requests (read/list/search/open/connect/write).",
                    "Use inline_answer only for lightweight non-actionable questions.",
                    "Avoid intent='unknown' when request maps to a common assistant action.",
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
      output: normalizeOutput(input.transcript, parsed),
      latencyMs: Math.round(performance.now() - started),
      source: "gemini" as const,
    };
  } catch {
    const heuristic = heuristicAgentA(input.transcript);
    return {
      output: normalizeOutput(input.transcript, heuristic),
      latencyMs: Math.round(performance.now() - started),
      source: "heuristic" as const,
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}



