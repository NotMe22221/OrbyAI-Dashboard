import { createBrowserClient } from "@supabase/ssr";

const FALLBACK_SUPABASE_URL = "https://xqhllnrqmgzbtikdrdai.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxaGxsbnJxbWd6YnRpa2RyZGFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4OTUxMDUsImV4cCI6MjA4NzQ3MTEwNX0.yqjg5bxGVBs1QlyPXb0_vsBxE2S50Of-f30T9IZ2wLg";

export function createSupabaseBrowserClient() {
  const rawUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    FALLBACK_SUPABASE_URL;
  const rawAnon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    FALLBACK_SUPABASE_ANON_KEY;
  const url = rawUrl.trim();
  const anon = rawAnon.trim();

  return createBrowserClient(url, anon);
}



