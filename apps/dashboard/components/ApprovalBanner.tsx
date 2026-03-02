"use client";

import { useVoiceSession } from "@/context/VoiceSessionContext";

export function ApprovalBanner() {
  const { pendingApproval, approveAction, rejectAction } = useVoiceSession();

  if (!pendingApproval) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-warn/50 bg-warn/10 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-warn">Approval Required</p>
      <p className="mt-2 text-sm text-slate-100">Action: {pendingApproval.action}</p>
      <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-black/20 p-3 text-xs text-slate-200">{pendingApproval.preview}</pre>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => void approveAction()}
          className="rounded-md bg-ok px-3 py-1.5 text-sm font-medium text-black"
        >
          Confirm
        </button>
        <button
          type="button"
          onClick={() => void rejectAction()}
          className="rounded-md border border-white/20 px-3 py-1.5 text-sm text-slate-200"
        >
          Cancel
        </button>
      </div>
    </section>
  );
}



