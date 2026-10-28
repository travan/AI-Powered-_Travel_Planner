"use client";
import { UiText, useUiText } from "../i18n/UiText";
interface TopbarProps {
  title?: string;
  icon?: string;
  actions?: React.ReactNode;
}

export function Topbar({ title = "Horizon", icon, actions }: TopbarProps) {
  const t = useUiText();
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-gray-100 bg-white/90 px-6 backdrop-blur-sm">
      {/* Left: title */}
      <div className="flex items-center gap-2">
        {icon && (
          <span className="material-symbols-outlined text-indigo-500 text-[20px]">
            {icon}
          </span>
        )}
        <span className="font-semibold text-gray-900">
          <UiText text={title} />
        </span>
      </div>

      {/* Right: actions slot + bell + avatar */}
      <div className="flex items-center gap-3">
        {actions}

        {/* Notification bell */}
        <button
          className="relative flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
          aria-label={t("Notifications")}
        >
          <span className="material-symbols-outlined text-[20px]">
            notifications
          </span>
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
        </button>

        {/* Avatar */}
        <div className="h-8 w-8 overflow-hidden rounded-full bg-indigo-100 ring-2 ring-white shadow">
          <img
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuC7qF9Sw2WWPs5eQxIgFivmTAeZTYWgviIvU_ABIk2k6K4abJyfDMYShpZ1qN4eINleaI-0AOd5bU-UmYrYGcX6HD3tSWgnOrhloeQDlL36YZZ2rPkFGCa4GX8iLJyr-0ER5P5oJiPfVLlgvufoVO71zttFY-PVb92W4SS1j0WXMJMytPH4H9k8u8HxRQkoju_1tEe009cf-rhHJWY78rxmEXeiBBPJoC-iCD8OYCqSjwTC7PyxXtetEswMRdtaUehWs_2CiH1NJ9k"
            alt={t("User")}
            className="h-full w-full object-cover"
          />
        </div>
      </div>
    </header>
  );
}
