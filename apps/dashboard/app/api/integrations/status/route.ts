import { NextResponse } from "next/server";
import { ALL_SERVICES, QUICK_SAY_EXAMPLES } from "@/lib/constants";
import { getIntegrationLastUsedMap } from "@/lib/db";
import { ensureProviderEnv, getIntegrationConnectionReport } from "@/lib/integrations";
import { requireAuthedUser } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireAuthedUser();
    const lastUsed = await getIntegrationLastUsedMap(user.id);

    const reports = await Promise.all(
      ALL_SERVICES.map(async (service) => {
        const env = ensureProviderEnv(service);
        if (!env.ready) {
          return {
            service,
            connected: false,
            state: "error" as const,
            account: null,
            expires_at: null,
            last_used: lastUsed[service] ?? null,
            quick_say: QUICK_SAY_EXAMPLES[service],
            ready: env.ready,
            missing_env: env.missing,
            health: {
              ok: false,
              checked_at: new Date().toISOString(),
              code: "missing_env",
              message: `Missing environment variables: ${env.missing.join(", ")}`,
            },
          };
        }

        const report = await getIntegrationConnectionReport(user.id, service);
        return {
          service,
          connected: report.connected,
          state: report.state,
          account: report.account,
          expires_at: report.expires_at,
          last_used: lastUsed[service] ?? null,
          quick_say: QUICK_SAY_EXAMPLES[service],
          ready: env.ready,
          missing_env: env.missing,
          health: report.health,
        };
      }),
    );

    return NextResponse.json({ integrations: reports });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

