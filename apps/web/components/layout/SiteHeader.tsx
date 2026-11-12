"use client";
import { UiText } from "../i18n/UiText";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { NotificationBell } from "./NotificationBell";
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
  const pathname = usePathname();
  const navigationText = useTranslations("common");
  const userInfo = useUserInfo();

  return (
    <header className="bg-surface/80 backdrop-blur-md sticky top-0 z-50 shadow-[0_8px_32px_rgba(0,93,144,0.04)] w-full">
      <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-4 py-3 lg:grid-cols-[auto_minmax(0,1fr)_auto_auto] lg:gap-4 lg:px-6 lg:py-4 xl:gap-8">
        <Link href="/plan" className="col-start-2 row-start-1 inline-flex lg:col-start-1">
          <CoHorizonLogo className="text-xl text-primary lg:text-2xl" />
        </Link>
        <nav
          className="col-start-2 row-start-1 hidden items-center gap-2 lg:flex xl:gap-6"
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
                className={`whitespace-nowrap rounded-full px-2 py-1 font-headline font-bold transition-colors xl:px-3 ${
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
        <NotificationBell className="relative col-start-3 row-start-1 justify-self-end" />
        <div className="col-start-1 row-start-1 justify-self-start lg:col-start-4">
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
