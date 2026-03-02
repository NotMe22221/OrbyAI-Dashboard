"use client";

type ActivityItem = {
  id: string;
  message: string;
  step: string;
  createdAt: string;
};

export function TaskOverlay({ items }: { items: ActivityItem[] }) {
  const head = items.slice(0, 5);

  return (
    <section className="rounded-2xl border border-white/10 bg-panel/70 p-4">
      <p className="mb-3 text-xs uppercase tracking-[0.2em] text-slate-400">Task Overlay</p>
      <div className="space-y-2">
        {head.length === 0 ? (
          <p className="text-sm text-slate-400">No active steps yet.</p>
        ) : (
          head.map((item) => (
            <div key={item.id} className="flex items-start gap-2 rounded-lg bg-panelSoft/60 px-3 py-2">
              <span className="mt-1 inline-flex h-2.5 w-2.5 rounded-full bg-ok" />
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-400">{item.message}</p>
                <p className="text-sm text-slate-100">{item.step}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}



