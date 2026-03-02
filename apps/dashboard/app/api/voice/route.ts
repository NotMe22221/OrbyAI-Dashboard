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
import { synthesizeVoiceSummary } from "@/lib/tts/elevenlabs";

export const runtime = "nodejs";

function approvePreview(operation: string, params: Record<string, unknown>) {
  const to = String(params.to ?? params.recipient ?? "Unknown");
  const subject = String(params.subject ?? params.title ?? operation);
  return `To: ${to}\nSubj: ${subject}`;
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

      for (const action of pending.actions) {
        publishEvent(sessionId, {
          type: "status",
          message: "acting",
          step: `${action.service}: ${action.operation}`,
        });
        try {
          const result = await executeIntegrationAction(userId, action);
          await addActionLog({ sessionId, action, approved: true, result });
        } catch (error) {
          await addActionLog({
            sessionId,
            action,
            approved: true,
            result: { error: error instanceof Error ? error.message : "execution_failed" },
          });
        }
      }

      const audioUrl = await synthesizeVoiceSummary(pending.voiceSummary);
      await addMessage({
        sessionId,
        role: "assistant",
        content: pending.responseText,
        voiceSummary: pending.voiceSummary,
      });

      publishEvent(sessionId, {
        type: "complete",
        voice_summary: pending.voiceSummary,
        audio_url: audioUrl,
        response_text: pending.responseText,
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

  for (const action of agentB.output.actions) {
    publishEvent(sessionId, {
      type: "status",
      message: "acting",
      step: `${action.service}: ${action.operation}`,
    });

    try {
      const result = await executeIntegrationAction(userId, action);
      await addActionLog({ sessionId, action, approved: false, result });
    } catch (error) {
      await addActionLog({
        sessionId,
        action,
        approved: false,
        result: { error: error instanceof Error ? error.message : "action_failed" },
      });
    }
  }

  const responseText = agentB.output.response_text;
  const voiceSummary = agentB.output.voice_summary.slice(0, 300);
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



