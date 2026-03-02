import { AgentBOutputSchema, type AgentAOutput, type AgentBOutput } from "@resident-secretary/contracts";
import { optionalEnv } from "../env";
import { WRITE_OPERATIONS } from "../constants";

function guessActions(transcript: string): AgentBOutput {
  const lower = transcript.toLowerCase();
  const actions: AgentBOutput["actions"] = [];

  if (lower.includes("email") || lower.includes("gmail")) {
    actions.push({
      service: "gmail",
      operation: lower.includes("send") ? "send_email" : "read_inbox",
      params: { query: transcript },
      requires_approval: lower.includes("send"),
    });
  }
  if (lower.includes("calendar") || lower.includes("meeting")) {
    const write = WRITE_OPERATIONS.some((word) => lower.includes(word));
    actions.push({
      service: "calendar",
      operation: write ? "create_or_update_event" : "list_events",
      params: { query: transcript },
      requires_approval: write,
    });
  }
  if (lower.includes("notion") || lower.includes("page")) {
    const write = WRITE_OPERATIONS.some((word) => lower.includes(word));
    actions.push({
      service: "notion",
      operation: write ? "write_page" : "read_page",
      params: { query: transcript },
      requires_approval: write,
    });
  }
  if (lower.includes("youtube") || lower.includes("video")) {
    actions.push({
      service: "youtube",
      operation: "search_and_summarize",
      params: { query: transcript },
      requires_approval: false,
    });
  }

  return {
    response_text: "I mapped your request and prepared the required actions.",
    voice_summary: "I mapped your request and prepared the next steps.",
    actions,
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

export async function runAgentB(input: {
  transcript: string;
  sessionContext: unknown;
  agentAOutput: AgentAOutput;
  integrationData: unknown;
}) {
  const started = performance.now();
  const apiKey = optionalEnv("ANTHROPIC_API_KEY");

  if (!apiKey) {
    return {
      output: guessActions(input.transcript),
      latencyMs: Math.round(performance.now() - started),
      source: "heuristic" as const,
    };
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? "claude-3-7-sonnet-20250219",
        max_tokens: 1000,
        temperature: 0.1,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: [
                  "Return valid JSON only.",
                  "Schema: { response_text, voice_summary(max300), actions[], follow_up_question? }",
                  "Each action: {service, operation, params, requires_approval}",
                  `Transcript: ${input.transcript}`,
                  `Session context: ${JSON.stringify(input.sessionContext)}`,
                  `Agent A output: ${JSON.stringify(input.agentAOutput)}`,
                  `Integration data: ${JSON.stringify(input.integrationData)}`,
                ].join("\n"),
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`Claude request failed: ${res.status}`);
    }

    const payload = await res.json();
    const text =
      payload?.content
        ?.filter((item: { type?: string }) => item?.type === "text")
        ?.map((item: { text?: string }) => item.text ?? "")
        ?.join("\n") ?? "";

    const parsed = AgentBOutputSchema.parse(extractJson(text));
    return {
      output: parsed,
      latencyMs: Math.round(performance.now() - started),
      source: "claude" as const,
    };
  } catch {
    return {
      output: guessActions(input.transcript),
      latencyMs: Math.round(performance.now() - started),
      source: "heuristic" as const,
    };
  }
}



