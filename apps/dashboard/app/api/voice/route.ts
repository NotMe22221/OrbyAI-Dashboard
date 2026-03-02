import { NextResponse } from "next/server";
import { VoiceRequestSchema } from "@resident-secretary/contracts";
import { runAgentA } from "@/lib/agents/agent-a-gemini";
import { routeByAgentA } from "@/lib/agents/coordinator";
import { runAgentB } from "@/lib/agents/agent-b-claude";
import {
  addActionLog,
  addAgentLog,
  addMessage,
  ensureSession,
  getIntegrationsForUser,
  getRecentMessages,
  markSessionEnded,
} from "@/lib/db";
import { getPendingApproval, clearPendingApproval, isApprovalTranscript, isRejectionTranscript, setPendingApproval } from "@/lib/approvals";
import { requireAuthedUser } from "@/lib/supabase-server";
import { publishEvent } from "@/lib/sse-hub";
import { executeIntegrationAction } from "@/lib/integrations";
import { isIntegrationAuthError } from "@/lib/integrations/errors";
import { synthesizeVoiceSummary } from "@/lib/tts/elevenlabs";

export const runtime = "nodejs";

function approvePreview(operation: string, params: Record<string, unknown>) {
  const to = String(params.to ?? params.recipient ?? "Unknown");
  const subject = String(params.subject ?? params.title ?? operation);
  return `To: ${to}\nSubj: ${subject}`;
}

function isMockResult(result: unknown) {
  if (!result || typeof result !== "object") {
    return false;
  }
  const row = result as Record<string, unknown>;
  return row.mock === true || row.source === "mock_data";
}

function summarizeActionResult(action: { service: string; operation: string }, result: unknown) {
  const asObj = (result ?? {}) as Record<string, unknown>;
  const mockPrefix = isMockResult(result) ? "Demo mode (integration not connected). " : "";

  if (action.service === "gmail" && action.operation === "read_inbox") {
    const messages = Array.isArray(asObj.messages) ? asObj.messages : [];
    if (messages.length === 0) {
      return `${mockPrefix}No recent emails found.`;
    }

    const lines = messages.slice(0, 3).map((msg, idx) => {
      const row = msg as Record<string, unknown>;
      const subject = String(row.subject ?? "(no subject)");
      const from = String(row.from ?? "unknown sender");
      const snippet = String(row.snippet ?? "");
      return `${idx + 1}. ${subject} - ${from}\n   ${snippet}`;
    });
    return `${mockPrefix}Top latest emails:\n${lines.join("\n")}`;
  }

  if (action.service === "calendar" && action.operation === "list_events") {
    const items = Array.isArray(asObj.items) ? asObj.items : [];
    if (items.length === 0) {
      return `${mockPrefix}No upcoming calendar events found.`;
    }
    const lines = items.slice(0, 5).map((event, idx) => {
      const row = event as Record<string, unknown>;
      const title = String(row.summary ?? "(untitled)");
      const start = (row.start as Record<string, unknown> | undefined)?.dateTime ??
        (row.start as Record<string, unknown> | undefined)?.date ??
        "unknown time";
      return `${idx + 1}. ${title} at ${String(start)}`;
    });
    return `${mockPrefix}Upcoming events:\n${lines.join("\n")}`;
  }

  if (action.service === "youtube" && action.operation === "search_and_summarize") {
    const items = Array.isArray(asObj.items) ? asObj.items : [];
    if (items.length === 0) {
      return `${mockPrefix}No YouTube videos found.`;
    }
    const lines = items.slice(0, 3).map((item, idx) => {
      const row = item as Record<string, unknown>;
      const snippet = row.snippet as Record<string, unknown> | undefined;
      const id = row.id as Record<string, unknown> | undefined;
      const title = String(snippet?.title ?? "(untitled)");
      const videoId = String(id?.videoId ?? "");
      const url = videoId ? `https://www.youtube.com/watch?v=${videoId}` : "https://www.youtube.com";
      return `${idx + 1}. ${title}\n   ${url}`;
    });
    return `${mockPrefix}Top YouTube results:\n${lines.join("\n")}`;
  }

  if (action.service === "notion") {
    const results = Array.isArray(asObj.results) ? asObj.results : [];
    if (results.length === 0) {
      return `${mockPrefix}No Notion pages matched.`;
    }
    return `${mockPrefix}Found ${results.length} Notion items.`;
  }

  if (typeof asObj.note === "string" && asObj.note.trim()) {
    if (mockPrefix && !asObj.note.toLowerCase().includes("demo mode")) {
      return `${mockPrefix}${asObj.note}`;
    }
    return asObj.note;
  }

  return `${mockPrefix}${action.service}.${action.operation} completed.`;
}

function buildDetailedResponse(base: string, outcomes: Array<{ action: { service: string; operation: string }; result: unknown; error?: string }>) {
  if (outcomes.length === 0) {
    return base;
  }
  const hasMockData = outcomes.some((entry) => isMockResult(entry.result));

  const lines = outcomes.map((entry) => {
    if (entry.error) {
      return `${entry.action.service}.${entry.action.operation}: ${entry.error}`;
    }
    return summarizeActionResult(entry.action, entry.result);
  });

  const sections = [base];
  if (hasMockData) {
    sections.push("Demo mode: one or more integrations are not connected, so I used mock data.");
  }
  sections.push(lines.join("\n\n"));
  return sections.join("\n\n");
}

function actionErrorMessage(action: { service: string; operation: string }, error: unknown) {
  if (isIntegrationAuthError(error)) {
    return `Connection for ${action.service} is no longer valid. Reconnect ${action.service} in Connections and try again.`;
  }
  return error instanceof Error ? error.message : "action_failed";
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = VoiceRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid voice payload", detail: parsed.error.flatten() }, { status: 400 });
  }

  let userId = "";
  try {
    const user = await requireAuthedUser();
    userId = user.id;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { session_id: sessionId, transcript, context } = parsed.data;
  await ensureSession(sessionId, userId);
  await addMessage({ sessionId, role: "user", content: transcript });

  const normalizedTranscript = transcript.trim().toLowerCase();
  if (["end session", "clear session", "new session"].includes(normalizedTranscript)) {
    await markSessionEnded(sessionId);
    const responseText = "Session ended. Context memory has been cleared.";
    const voiceSummary = "Session ended. Context cleared.";
    const audioUrl = await synthesizeVoiceSummary(voiceSummary);
    await addMessage({ sessionId, role: "assistant", content: responseText, voiceSummary });
    publishEvent(sessionId, {
      type: "complete",
      voice_summary: voiceSummary,
      audio_url: audioUrl,
      response_text: responseText,
    });
    return NextResponse.json({ accepted: true, session_id: sessionId, status: "session_ended" }, { status: 202 });
  }

  publishEvent(sessionId, { type: "status", message: "thinking", step: "Classifying intent" });

  const pending = getPendingApproval(userId, sessionId);
  if (pending) {
    if (isApprovalTranscript(transcript)) {
      clearPendingApproval(userId, sessionId);
      publishEvent(sessionId, { type: "status", message: "acting", step: "Approval received. Executing actions" });
      const outcomes: Array<{ action: { service: string; operation: string }; result: unknown; error?: string }> = [];

      for (const action of pending.actions) {
        publishEvent(sessionId, {
          type: "status",
          message: "acting",
          step: `${action.service}: ${action.operation}`,
        });
        try {
          const result = await executeIntegrationAction(userId, action);
          await addActionLog({ sessionId, action, approved: true, result });
          outcomes.push({ action, result });
        } catch (error) {
          const message = actionErrorMessage(action, error);
          if (isIntegrationAuthError(error)) {
            publishEvent(sessionId, {
              type: "error",
              message,
            });
          }
          await addActionLog({
            sessionId,
            action,
            approved: true,
            result: { error: message },
          });
          outcomes.push({ action, result: null, error: message });
        }
      }

      const responseText = buildDetailedResponse(pending.responseText, outcomes);
      const voiceSummary = responseText.slice(0, 300);
      const audioUrl = await synthesizeVoiceSummary(voiceSummary);
      await addMessage({
        sessionId,
        role: "assistant",
        content: responseText,
        voiceSummary,
      });

      publishEvent(sessionId, {
        type: "complete",
        voice_summary: voiceSummary,
        audio_url: audioUrl,
        response_text: responseText,
      });

      return NextResponse.json({ accepted: true, session_id: sessionId, status: "approved_and_executed" }, { status: 202 });
    }

    if (isRejectionTranscript(transcript)) {
      clearPendingApproval(userId, sessionId);
      const voiceSummary = "Canceled. I did not execute that action.";
      const responseText = "Canceled. No irreversible action was executed.";
      const audioUrl = await synthesizeVoiceSummary(voiceSummary);

      await addMessage({
        sessionId,
        role: "assistant",
        content: responseText,
        voiceSummary,
      });

      publishEvent(sessionId, {
        type: "complete",
        voice_summary: voiceSummary,
        audio_url: audioUrl,
        response_text: responseText,
      });

      return NextResponse.json({ accepted: true, session_id: sessionId, status: "approval_rejected" }, { status: 202 });
    }
  }

  const sessionContext = await getRecentMessages(sessionId);
  const agentA = await runAgentA({
    transcript,
    sessionContext,
    userProfile: context.user_profile,
  });

  await addAgentLog({
    sessionId,
    agent: "agent_a",
    input: { transcript, sessionContext, userProfile: context.user_profile },
    output: agentA.output,
    latencyMs: agentA.latencyMs,
  });

  const decision = routeByAgentA(agentA.output);

  if (decision.path === "inline") {
    const responseText = agentA.output.inline_answer ?? "I can help with that.";
    const voiceSummary = responseText.slice(0, 300);
    const audioUrl = await synthesizeVoiceSummary(voiceSummary);

    await addMessage({
      sessionId,
      role: "assistant",
      content: responseText,
      voiceSummary,
    });

    publishEvent(sessionId, {
      type: "complete",
      voice_summary: voiceSummary,
      audio_url: audioUrl,
      response_text: responseText,
    });

    return NextResponse.json({ accepted: true, session_id: sessionId, mode: "inline" }, { status: 202 });
  }

  if (decision.path === "fallback") {
    const responseText = "I need more detail to safely continue. Tell me the service and exact action to take.";
    const voiceSummary = responseText.slice(0, 300);
    const audioUrl = await synthesizeVoiceSummary(voiceSummary);

    await addMessage({
      sessionId,
      role: "assistant",
      content: responseText,
      voiceSummary,
    });

    publishEvent(sessionId, {
      type: "complete",
      voice_summary: voiceSummary,
      audio_url: audioUrl,
      response_text: responseText,
    });

    return NextResponse.json({ accepted: true, session_id: sessionId, mode: "fallback" }, { status: 202 });
  }

  publishEvent(sessionId, { type: "status", message: "thinking", step: "Planning actions" });

  const integrationData = await getIntegrationsForUser(userId);
  const agentB = await runAgentB({
    transcript,
    sessionContext,
    agentAOutput: agentA.output,
    integrationData,
  });

  await addAgentLog({
    sessionId,
    agent: "agent_b",
    input: { transcript, sessionContext, agentAOutput: agentA.output, integrationData },
    output: agentB.output,
    latencyMs: agentB.latencyMs,
  });

  const approvalActions = agentB.output.actions.filter((action) => action.requires_approval);
  if (approvalActions.length > 0) {
    const first = approvalActions[0];
    if (!first) {
      return NextResponse.json({ accepted: true, session_id: sessionId, mode: "awaiting_approval" }, { status: 202 });
    }
    setPendingApproval({
      userId,
      sessionId,
      actions: approvalActions,
      responseText: agentB.output.response_text,
      voiceSummary: agentB.output.voice_summary,
    });

    publishEvent(sessionId, {
      type: "approval",
      action: first.operation,
      preview: approvePreview(first.operation, first.params),
    });

    return NextResponse.json({ accepted: true, session_id: sessionId, mode: "awaiting_approval" }, { status: 202 });
  }

  const outcomes: Array<{ action: { service: string; operation: string }; result: unknown; error?: string }> = [];
  for (const action of agentB.output.actions) {
    publishEvent(sessionId, {
      type: "status",
      message: "acting",
      step: `${action.service}: ${action.operation}`,
    });

    try {
      const result = await executeIntegrationAction(userId, action);
      await addActionLog({ sessionId, action, approved: false, result });
      outcomes.push({ action, result });
    } catch (error) {
      const message = actionErrorMessage(action, error);
      if (isIntegrationAuthError(error)) {
        publishEvent(sessionId, {
          type: "error",
          message,
        });
      }
      await addActionLog({
        sessionId,
        action,
        approved: false,
        result: { error: message },
      });
      outcomes.push({ action, result: null, error: message });
    }
  }

  const responseText = buildDetailedResponse(agentB.output.response_text, outcomes);
  const voiceSummary = responseText.slice(0, 300);
  const audioUrl = await synthesizeVoiceSummary(voiceSummary);

  await addMessage({
    sessionId,
    role: "assistant",
    content: responseText,
    voiceSummary,
  });

  publishEvent(sessionId, {
    type: "complete",
    voice_summary: voiceSummary,
    audio_url: audioUrl,
    response_text: responseText,
  });

  return NextResponse.json({ accepted: true, session_id: sessionId, mode: "agent_b" }, { status: 202 });
}
