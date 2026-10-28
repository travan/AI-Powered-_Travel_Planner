"use client";
import { UiText } from "../i18n/UiText";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { icon: "explore", href: "/plan", label: "Home" },
  { icon: "flight_takeoff", href: "/trips", label: "Trips" },
  { icon: "payments", href: "/budget", label: "Budget" },
  { icon: "person", href: "/profile", label: "Profile" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 w-full flex justify-around items-center px-4 pb-8 pt-4 bg-white/90 backdrop-blur-2xl shadow-[0_-4px_24px_rgba(0,93,144,0.06)] rounded-t-[2.5rem] z-50">
      {NAV.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center justify-center px-5 py-2 rounded-2xl transition-all duration-300 active:scale-90 ${
              active
                ? "bg-sky-100 text-sky-900"
                : "text-slate-400 hover:text-sky-600"
            }`}
          >
            <span
              className="material-symbols-outlined text-[24px]"
              style={
                active
                  ? {
                      fontVariationSettings:
                        "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24",
                    }
                  : undefined
              }
            >
              {item.icon}
            </span>
            <span className="font-body text-[11px] font-semibold uppercase tracking-widest mt-1">
              <UiText text={item.label} />
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
