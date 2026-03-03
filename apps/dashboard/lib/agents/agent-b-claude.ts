import { AgentBOutputSchema, type AgentAOutput, type AgentBOutput } from "@resident-secretary/contracts";
import { optionalEnv } from "../env";
import { WRITE_OPERATIONS } from "../constants";

function buildHeuristicNarrative(transcript: string, actions: AgentBOutput["actions"]) {
  if (actions.length === 0) {
    return {
      responseText:
        "I need one specific task to run. Try: 'read my latest emails', 'show today’s calendar events', or 'search YouTube for topic X'.",
      voiceSummary: "Tell me one specific task, like reading latest emails or listing calendar events.",
    };
  }

  const lead = actions[0];
  if (!lead) {
    return {
      responseText: "I mapped your request. Tell me what you want to run first.",
      voiceSummary: "I mapped your request. Tell me what to run first.",
    };
  }

  const actionSummary = actions
    .map((action) => `${action.service}.${action.operation}${action.requires_approval ? " (needs approval)" : ""}`)
    .join(", ");

  return {
    responseText: `I understood your request and I will run: ${actionSummary}.`,
    voiceSummary: `Running ${lead.service} ${lead.operation.replaceAll("_", " ")} now.`,
  };
}

function postProcessOutput(output: AgentBOutput, source: "claude" | "heuristic"): AgentBOutput {
  const responseText = output.response_text.trim();
  const vague =
    responseText.length < 12 ||
    /prepared|completed|starting|done\./i.test(responseText) ||
    responseText.toLowerCase() === "done";

  const firstAction = output.actions[0];
  const actionHint = firstAction
    ? `Action: ${firstAction.service}.${firstAction.operation}.`
    : "No integration action was inferred.";
  const withHint = vague ? `${actionHint} Provide one clear task if this is not what you wanted.` : responseText;

  const finalText =
    source === "heuristic" && output.actions.length === 0
      ? `${withHint} Claude is not configured right now, so I am using fallback intent logic.`
      : withHint;

  const summaryBase = output.voice_summary.trim().slice(0, 300);
  const voiceSummary =
    summaryBase.length > 0 ? summaryBase : `${firstAction ? `${firstAction.service} ${firstAction.operation}` : "Request"} ready.`;

  return {
    ...output,
    response_text: finalText,
    voice_summary: voiceSummary.slice(0, 300),
  };
}

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

  const narrative = buildHeuristicNarrative(transcript, actions);
  return {
    response_text: narrative.responseText,
    voice_summary: narrative.voiceSummary.slice(0, 300),
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
    const fallback = guessActions(input.transcript);
    return {
      output: postProcessOutput(fallback, "heuristic"),
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
                  "Write a direct answer first, then summarize planned actions clearly.",
                  "Avoid vague phrasing like 'prepared' or 'completed' without details.",
                  "If blocked, add an explicit next step in response_text.",
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
      output: postProcessOutput(parsed, "claude"),
      latencyMs: Math.round(performance.now() - started),
      source: "claude" as const,
    };
  } catch {
    const fallback = guessActions(input.transcript);
    return {
      output: postProcessOutput(fallback, "heuristic"),
      latencyMs: Math.round(performance.now() - started),
      source: "heuristic" as const,
    };
  }
}



