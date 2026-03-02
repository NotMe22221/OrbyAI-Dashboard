import { NextResponse } from "next/server";
import { getHistorySessions } from "@/lib/db";
import { requireAuthedUser } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireAuthedUser();
    const url = new URL(request.url);
    const search = url.searchParams.get("search");
    const page = Number(url.searchParams.get("page") ?? "1");
    const pageSize = Number(url.searchParams.get("page_size") ?? "20");

    const result = await getHistorySessions(user.id, search, page, pageSize);

    return NextResponse.json({
      sessions: result.sessions,
      page,
      page_size: pageSize,
      total: result.total,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}



