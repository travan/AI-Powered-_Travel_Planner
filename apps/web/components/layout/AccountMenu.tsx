"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface AccountMenuProps {
  avatarUrl: string | null;
  displayName: string | null;
  email: string | null;
}

export function AccountMenu({ avatarUrl, displayName, email }: AccountMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div ref={menuRef} className="relative">
      {/* Avatar trigger */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-primary-fixed bg-surface-container-high flex items-center justify-center hover:ring-primary transition-all focus:outline-none focus-visible:ring-primary"
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="User profile" className="w-full h-full object-cover" />
        ) : (
          <span className="material-symbols-outlined text-outline">person</span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 w-56 rounded-xl bg-surface border border-outline/10 shadow-[0_8px_32px_rgba(0,93,144,0.14)] overflow-hidden z-50"
        >
          {/* User info */}
          {(displayName || email) && (
            <div className="px-4 py-3 border-b border-outline/10">
              {displayName && (
                <p className="text-sm font-semibold text-on-surface truncate">{displayName}</p>
              )}
              {email && (
                <p className="text-xs text-on-surface-variant truncate">{email}</p>
              )}
            </div>
          )}

          {/* Sign out */}
          <button
            role="menuitem"
            onClick={handleSignOut}
            disabled={signingOut}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-on-surface hover:bg-surface-container-low transition-colors disabled:opacity-60"
          >
            <span className="material-symbols-outlined text-[18px] text-outline">logout</span>
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
