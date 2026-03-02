import type { AgentAOutput } from "@resident-secretary/contracts";

export type CoordinatorDecision =
  | { path: "inline"; reason: string }
  | { path: "agent_b"; reason: string }
  | { path: "fallback"; reason: string };

export function routeByAgentA(agentA: AgentAOutput): CoordinatorDecision {
  if (!agentA.requires_agent_b && agentA.inline_answer) {
    return { path: "inline", reason: "agent_a_inline_answer" };
  }

  switch (agentA.intent) {
    case "simple_question":
      return { path: "inline", reason: "simple_question" };
    case "single_integration":
    case "multi_integration":
    case "calendar_query":
    case "compose_email":
      return { path: "agent_b", reason: agentA.intent };
    default:
      return { path: "fallback", reason: "unknown_intent" };
  }
}



