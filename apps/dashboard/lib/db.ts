import type { AgentAOutput, AgentBAction, AgentBOutput, IntegrationService } from "@resident-secretary/contracts";
import { createSupabaseAdminClient } from "./supabase-server";

export async function ensureSession(sessionId: string, userId: string) {
  const supabase = createSupabaseAdminClient();
  await supabase.from("sessions").upsert({ id: sessionId, user_id: userId }, { onConflict: "id" });
}

export async function addMessage(params: {
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  voiceSummary?: string;
}) {
  const supabase = createSupabaseAdminClient();
  await supabase.from("messages").insert({
    session_id: params.sessionId,
    role: params.role,
    content: params.content,
    voice_summary: params.voiceSummary ?? null,
  });
}

export async function addAgentLog(params: {
  sessionId: string;
  agent: "agent_a" | "agent_b";
  input: unknown;
  output: AgentAOutput | AgentBOutput | Record<string, unknown>;
  latencyMs: number;
  tokensUsed?: number;
}) {
  const supabase = createSupabaseAdminClient();
  await supabase.from("agent_log").insert({
    session_id: params.sessionId,
    agent: params.agent,
    input: params.input,
    output: params.output,
    latency_ms: params.latencyMs,
    tokens_used: params.tokensUsed ?? null,
  });
}

export async function getRecentMessages(sessionId: string) {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("messages")
    .select("role,content,created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(5);

  return (data ?? []).reverse();
}

export async function addActionLog(params: {
  sessionId: string;
  action: AgentBAction;
  approved: boolean;
  result: unknown;
}) {
  const supabase = createSupabaseAdminClient();
  await supabase.from("actions").insert({
    session_id: params.sessionId,
    service: params.action.service,
    operation: params.action.operation,
    params: params.action.params,
    approved: params.approved,
    executed_at: new Date().toISOString(),
    result: params.result,
  });
}

export async function getIntegrationRow(userId: string, service: IntegrationService) {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("integrations")
    .select("user_id,service,access_token,refresh_token,expires_at,account_email")
    .eq("user_id", userId)
    .eq("service", service)
    .maybeSingle();

  return data;
}

export async function upsertIntegration(params: {
  userId: string;
  service: IntegrationService;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  accountEmail?: string;
}) {
  const supabase = createSupabaseAdminClient();
  await supabase.from("integrations").upsert(
    {
      user_id: params.userId,
      service: params.service,
      access_token: params.accessToken,
      refresh_token: params.refreshToken ?? null,
      expires_at: params.expiresAt ?? null,
      account_email: params.accountEmail ?? null,
    },
    { onConflict: "user_id,service" },
  );
}

export async function removeIntegration(userId: string, service: IntegrationService) {
  const supabase = createSupabaseAdminClient();
  await supabase.from("integrations").delete().eq("user_id", userId).eq("service", service);
}

export async function getIntegrationsForUser(userId: string) {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("integrations")
    .select("service,account_email,expires_at")
    .eq("user_id", userId);
  return data ?? [];
}

export async function getIntegrationLastUsedMap(userId: string) {
  const supabase = createSupabaseAdminClient();
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id")
    .eq("user_id", userId)
    .limit(2000);

  const sessionIds = (sessions ?? []).map((row) => row.id).filter(Boolean);
  if (sessionIds.length === 0) {
    return {};
  }

  const { data } = await supabase
    .from("actions")
    .select("service,executed_at")
    .in("session_id", sessionIds as string[])
    .order("executed_at", { ascending: false })
    .limit(4000);

  const lastUsed: Partial<Record<IntegrationService, string>> = {};
  for (const row of data ?? []) {
    const service = row.service as IntegrationService;
    if (!service || lastUsed[service]) {
      continue;
    }
    const executedAt = typeof row.executed_at === "string" ? row.executed_at : null;
    if (executedAt) {
      lastUsed[service] = executedAt;
    }
  }

  return lastUsed;
}

export async function getHistorySessions(userId: string, search: string | null, page: number, pageSize: number) {
  const supabase = createSupabaseAdminClient();

  let query = supabase
    .from("sessions")
    .select("id,started_at,ended_at,summary", { count: "exact" })
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (search && search.trim().length > 0) {
    const { data: matches } = await supabase
      .from("messages")
      .select("session_id")
      .ilike("content", `%${search}%`)
      .limit(200);

    const ids = Array.from(new Set((matches ?? []).map((row) => row.session_id).filter(Boolean)));
    if (ids.length > 0) {
      query = query.in("id", ids as string[]);
    } else {
      return { sessions: [], total: 0 };
    }
  }

  const { data, count } = await query;
  return { sessions: data ?? [], total: count ?? 0 };
}

export async function getSessionDetail(userId: string, sessionId: string) {
  const supabase = createSupabaseAdminClient();

  const { data: session } = await supabase
    .from("sessions")
    .select("id,user_id,started_at,ended_at,summary")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!session) {
    return null;
  }

  const { data: messages } = await supabase
    .from("messages")
    .select("id,role,content,voice_summary,created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  const { data: actions } = await supabase
    .from("actions")
    .select("id,service,operation,params,approved,executed_at,result")
    .eq("session_id", sessionId)
    .order("executed_at", { ascending: true });

  return {
    session,
    messages: messages ?? [],
    actions: actions ?? [],
  };
}

export async function markSessionEnded(sessionId: string) {
  const supabase = createSupabaseAdminClient();
  await supabase.from("sessions").update({ ended_at: new Date().toISOString() }).eq("id", sessionId);
}



