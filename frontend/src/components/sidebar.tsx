"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  BarChart3,
  Activity,
  LogOut,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth";

const nav = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Competitors", href: "/competitors", icon: Building2 },
  { label: "Analysis", href: "/analysis", icon: BarChart3 },
  { label: "Ops", href: "/ops", icon: Activity },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside className="fixed left-0 top-0 h-screen w-[220px] flex flex-col border-r border-white/8 bg-[#09090b]">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 h-14 border-b border-white/8">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-white">
          <Zap size={13} className="text-zinc-900" />
        </div>
        <span className="text-sm font-semibold text-white tracking-tight">Ripple</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {nav.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
                active
                  ? "bg-white/8 text-white font-medium"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-white/4",
              )}
            >
              <Icon size={15} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="px-3 py-4 border-t border-white/8">
        <div className="px-3 py-2 mb-1">
          <p className="text-xs text-zinc-500 truncate">{user?.email}</p>
        </div>
        <button
          onClick={() => void logout()}
          className="flex w-full items-center gap-2.5 px-3 py-2 rounded-md text-sm text-zinc-500 hover:text-zinc-300 hover:bg-white/4 transition-colors"
        >
          <LogOut size={15} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
