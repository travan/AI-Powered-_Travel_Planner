"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { icon: "home", href: "/plan", label: "Home" },
  { icon: "map", href: "/trips", label: "Trips" },
  { icon: "payments", href: "/budget", label: "Budget" },
  { icon: "person", href: "/profile", label: "Profile" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-y-0 left-0 z-30 flex w-16 flex-col items-center gap-2 py-4"
      style={{ background: "#0b0f19" }}>
      {/* Horizon logo */}
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 font-bold text-white text-base select-none shadow-lg">
        H
      </div>

      {/* Nav items */}
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            className={`group relative flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200 ${
              active
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/40"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">{item.icon}</span>

            {/* Tooltip */}
            <div className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-md bg-gray-800 px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              {item.label}
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
