import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const email = String(payload?.email ?? "").trim().toLowerCase();
  const password = String(payload?.password ?? "");

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Invalid email." }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("already") || msg.includes("exists") || msg.includes("registered")) {
      return NextResponse.json({ ok: true, existed: true });
    }

    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, existed: false });
}
