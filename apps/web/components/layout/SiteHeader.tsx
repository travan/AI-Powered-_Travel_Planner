"use client";
import { UiText, useUiText } from "../i18n/UiText";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AccountMenu } from "./AccountMenu";
import { CoHorizonLogo } from "./CoHorizonLogo";
import { PRIMARY_NAVIGATION, isNavigationActive } from "./navigation";
import { useTranslations } from "next-intl";

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

function toUserInfo(
  user:
    | {
        email?: string | null;
        user_metadata?: Record<string, unknown>;
      }
    | null
    | undefined,
): UserInfo {
  return {
    avatarUrl:
      typeof user?.user_metadata?.["avatar_url"] === "string"
        ? user.user_metadata["avatar_url"]
        : null,
    displayName:
      typeof user?.user_metadata?.["full_name"] === "string"
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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      updateUserInfo(session?.user);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return userInfo;
}

export function SiteHeader() {
  const t = useUiText();
  const pathname = usePathname();
  const navigationText = useTranslations("common");
  const userInfo = useUserInfo();

  return (
    <header className="bg-surface/80 backdrop-blur-md sticky top-0 z-50 shadow-[0_8px_32px_rgba(0,93,144,0.04)] w-full">
      {/* ── Mobile header ── */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center justify-items-start px-6 py-4 md:hidden">
        <AccountMenu
          avatarUrl={userInfo.avatarUrl}
          displayName={userInfo.displayName}
          email={userInfo.email}
        />
        <Link href="/plan" className="inline-flex">
          <CoHorizonLogo className="text-xl text-primary" />
        </Link>
        <button
          aria-label={t("Notifications")}
          className="material-symbols-outlined size-10 justify-self-end overflow-hidden text-outline/80 text-[22px]"
        >
          notifications
        </button>
      </div>

      {/* ── Desktop header ── */}
      <div className="hidden md:flex justify-between items-center w-full px-6 py-4">
        {/* Logo + nav */}
        <div className="flex items-center gap-8">
          <Link href="/plan" className="inline-flex">
            <CoHorizonLogo className="text-2xl text-primary" />
          </Link>
          <nav
            className="flex gap-6"
            aria-label={navigationText("main_navigation")}
            data-testid="desktop-navigation"
          >
            {PRIMARY_NAVIGATION.map((link) => {
              const active = isNavigationActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`font-headline font-bold transition-colors px-3 py-1 rounded-full ${
                    active
                      ? "text-primary"
                      : "text-outline hover:bg-surface-container-low"
                  }`}
                >
                  <UiText text={link.label} />
                </Link>
              );
            })}
          </nav>
        </div>
        {/* Right: bell + avatar */}
        <div className="flex items-center gap-4">
          <button
            aria-label={t("Notifications")}
            className="material-symbols-outlined size-10 shrink-0 overflow-hidden rounded-full text-[22px] text-outline transition-colors hover:bg-surface-container-low"
          >
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
