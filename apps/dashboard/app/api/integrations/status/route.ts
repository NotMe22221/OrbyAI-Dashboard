import { NextResponse } from "next/server";
import { ALL_SERVICES, QUICK_SAY_EXAMPLES } from "@/lib/constants";
import { getIntegrationsForUser } from "@/lib/db";
import { ensureProviderEnv } from "@/lib/integrations";
import { requireAuthedUser } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireAuthedUser();
    const rows = await getIntegrationsForUser(user.id);
    const byService = new Map(rows.map((row) => [row.service, row]));

    const payload = ALL_SERVICES.map((service) => {
      const row = byService.get(service);
      const env = ensureProviderEnv(service);

      return {
        service,
        connected: Boolean(row),
        account: row?.account_email ?? null,
        last_used: null,
        quick_say: QUICK_SAY_EXAMPLES[service],
        ready: env.ready,
        missing_env: env.missing,
      };
    });

    return NextResponse.json({ integrations: payload });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}



