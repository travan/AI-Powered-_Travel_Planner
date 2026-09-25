"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AccountMenu } from "./AccountMenu";

interface UserInfo {
  avatarUrl: string | null;
  displayName: string | null;
  email: string | null;
}

const EMPTY_USER_INFO: UserInfo = {
  avatarUrl: null,
  displayName: null,
  email: null,
};

let cachedUserInfo = EMPTY_USER_INFO;

function toUserInfo(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
} | null | undefined): UserInfo {
  return {
    avatarUrl: typeof user?.user_metadata?.["avatar_url"] === "string"
      ? user.user_metadata["avatar_url"]
      : null,
    displayName: typeof user?.user_metadata?.["full_name"] === "string"
      ? user.user_metadata["full_name"]
      : typeof user?.user_metadata?.["name"] === "string"
        ? user.user_metadata["name"]
        : null,
    email: user?.email ?? null,
  };
}

function useUserInfo() {
  const [userInfo, setUserInfo] = useState<UserInfo>(cachedUserInfo);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    const updateUserInfo = (user: Parameters<typeof toUserInfo>[0]) => {
      if (!active) return;
      const next = toUserInfo(user);
      if (
        next.avatarUrl === cachedUserInfo.avatarUrl &&
        next.displayName === cachedUserInfo.displayName &&
        next.email === cachedUserInfo.email
      ) {
        return;
      }
      cachedUserInfo = next;
      setUserInfo(next);
    };

    void supabase.auth.getSession().then(({ data: { session } }) => {
      updateUserInfo(session?.user);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      updateUserInfo(session?.user);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return userInfo;
}

const NAV_LINKS = [
  { href: "/plan", label: "Plan" },
  { href: "/trips", label: "My trips" },
  { href: "/explore", label: "Explore" },
  { href: "/guides", label: "Guides" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const userInfo = useUserInfo();

  return (
    <header className="bg-surface/80 backdrop-blur-md sticky top-0 z-50 shadow-[0_8px_32px_rgba(0,93,144,0.04)] w-full">
      {/* ── Mobile header: avatar left, Horizon center, bell right ── */}
      <div className="md:hidden flex justify-between items-center px-6 py-4">
        <AccountMenu
          avatarUrl={userInfo.avatarUrl}
          displayName={userInfo.displayName}
          email={userInfo.email}
        />
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
          <AccountMenu
            avatarUrl={userInfo.avatarUrl}
            displayName={userInfo.displayName}
            email={userInfo.email}
          />
        </div>
      </div>
    </header>
  );
}
