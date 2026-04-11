"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

function useAvatarUrl() {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env["NEXT_PUBLIC_SUPABASE_URL"]!,
      process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]!
    );
    supabase.auth.getUser().then(({ data: { user } }) => {
      setAvatarUrl(user?.user_metadata?.["avatar_url"] ?? null);
    });
  }, []);

  return avatarUrl;
}

const NAV_LINKS = [
  { href: "/plan", label: "Home" },
  { href: "/itinerary/comparison", label: "Explore" },
  { href: "/trips", label: "Guides" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const avatarUrl = useAvatarUrl();

  return (
    <header className="bg-surface/80 backdrop-blur-md sticky top-0 z-50 shadow-[0_8px_32px_rgba(0,93,144,0.04)] w-full">
      {/* ── Mobile header: avatar left, Horizon center, bell right ── */}
      <div className="md:hidden flex justify-between items-center px-6 py-4">
        <div className="w-8 h-8 rounded-full overflow-hidden ring-2 ring-primary-fixed bg-surface-container-high flex items-center justify-center">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="User profile" className="w-full h-full object-cover" />
          ) : (
            <span className="material-symbols-outlined text-outline text-lg">person</span>
          )}
        </div>
        <Link href="/plan" className="text-2xl font-black text-primary tracking-tight font-headline">
          Horizon
        </Link>
        <button className="material-symbols-outlined text-outline/80 text-[22px] p-1">
          notifications
        </button>
      </div>

      {/* ── Desktop header ── */}
      <div className="hidden md:flex justify-between items-center w-full px-6 py-4">
        {/* Logo + nav */}
        <div className="flex items-center gap-8">
          <Link href="/plan" className="text-2xl font-black text-primary tracking-tight font-headline">
            Horizon
          </Link>
          <nav className="flex gap-6">
            {NAV_LINKS.map((link) => {
              const active = pathname === link.href || pathname.startsWith(link.href + "/");
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`font-headline font-bold transition-colors px-3 py-1 rounded-full ${
                    active ? "text-primary" : "text-outline hover:bg-surface-container-low"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        {/* Right: bell + avatar */}
        <div className="flex items-center gap-4">
          <button className="material-symbols-outlined text-outline p-2 hover:bg-surface-container-low rounded-full transition-colors text-[22px]">
            notifications
          </button>
          <div className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-primary-fixed bg-surface-container-high flex items-center justify-center">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="User profile" className="w-full h-full object-cover" />
            ) : (
              <span className="material-symbols-outlined text-outline">person</span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
