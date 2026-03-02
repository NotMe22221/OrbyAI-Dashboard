export default function SettingsPage() {
  return (
    <div className="grid gap-4">
      <section className="rounded-2xl border border-white/10 bg-panel/60 p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Settings</p>
        <p className="mt-2 text-sm text-slate-200">
          Configure voice behavior, notification preferences, and security controls in environment variables and provider apps.
        </p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-panel/60 p-4">
        <p className="text-sm font-semibold text-white">Security Rules Enforced</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
          <li>Confirmation is required before send/post/delete/modify actions.</li>
          <li>LLM output is validated with Zod before execution.</li>
          <li>OAuth tokens are stored server-side only.</li>
          <li>No raw audio is persisted.</li>
          <li>Context sent to the agent pipeline is limited to the last 5 messages.</li>
        </ul>
      </section>
    </div>
  );
}



