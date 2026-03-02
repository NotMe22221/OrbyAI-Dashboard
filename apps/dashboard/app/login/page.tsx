"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [status, setStatus] = useState<string>("");

  async function submit() {
    setStatus("Working...");
    const supabase = createSupabaseBrowserClient();

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setStatus(error.message);
        return;
      }
      setStatus("Signed in. Redirecting...");
      window.location.href = "/";
      return;
    }

    const signupRes = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const signupPayload = await signupRes.json().catch(() => ({}));

    if (!signupRes.ok) {
      setStatus(signupPayload?.error ?? "Unable to create account.");
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setStatus(signInError.message);
      return;
    }

    setStatus("Account ready. Redirecting...");
    window.location.href = "/";
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-white/10 bg-panel/70 p-6">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Supabase Auth</p>
      <h1 className="mt-2 text-2xl font-semibold text-white">Resident Secretary Access</h1>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          className={`rounded-md px-3 py-1 text-sm ${mode === "signin" ? "bg-accent text-black" : "border border-white/20 text-slate-200"}`}
          onClick={() => setMode("signin")}
        >
          Sign in
        </button>
        <button
          type="button"
          className={`rounded-md px-3 py-1 text-sm ${mode === "signup" ? "bg-accent text-black" : "border border-white/20 text-slate-200"}`}
          onClick={() => setMode("signup")}
        >
          Sign up
        </button>
      </div>

      <div className="mt-4 space-y-3">
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email"
          className="w-full rounded-md border border-white/20 bg-black/20 px-3 py-2 text-sm text-white"
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          className="w-full rounded-md border border-white/20 bg-black/20 px-3 py-2 text-sm text-white"
        />
        <button
          type="button"
          onClick={() => void submit()}
          className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-black"
        >
          {mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </div>

      {status && <p className="mt-3 text-sm text-slate-300">{status}</p>}
    </div>
  );
}



