import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { getEnv } from "./env";

export function createSupabaseServerClient() {
  const cookieStore = cookies();
  const url = getEnv("SUPABASE_URL");
  const anon = getEnv("SUPABASE_ANON_KEY");

  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
        for (const cookie of cookiesToSet) {
          try {
            cookieStore.set(
              cookie.name,
              cookie.value,
              cookie.options as Parameters<typeof cookieStore.set>[2],
            );
          } catch {
            // Route handlers can fail to set cookies in some contexts.
          }
        }
      },
    },
  });
}

export function createSupabaseAdminClient() {
  const url = getEnv("SUPABASE_URL");
  const serviceRole = getEnv("SUPABASE_SERVICE_KEY");
  return createClient(url, serviceRole, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function requireAuthedUser() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Unauthorized");
  }

  return user;
}



