"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Home" },
  { href: "/history", label: "History" },
  { href: "/connections", label: "Connections" },
  { href: "/settings", label: "Settings" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="h-full w-[240px] border-r border-white/10 bg-panel/70 p-4">
      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
        <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Resident Secretary</p>
        <p className="mt-2 text-lg font-semibold text-white">Voice Dashboard</p>
      </div>

      <nav className="mt-6 space-y-2">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-3 py-2 text-sm ${
                active
                  ? "border border-accent/40 bg-accent/15 text-white"
                  : "border border-transparent text-slate-300 hover:border-white/20 hover:bg-white/5"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}



