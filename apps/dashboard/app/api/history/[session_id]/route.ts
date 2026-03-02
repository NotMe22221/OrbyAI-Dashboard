import { NextResponse } from "next/server";
import { getSessionDetail } from "@/lib/db";
import { requireAuthedUser } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: { session_id: string } },
) {
  try {
    const user = await requireAuthedUser();
    const data = await getSessionDetail(user.id, params.session_id);

    if (!data) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}



