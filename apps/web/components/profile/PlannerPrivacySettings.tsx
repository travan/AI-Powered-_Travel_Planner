"use client";
import React, { useEffect, useState } from "react";
import type { LearningSettings } from "@travel/types";
import { useAppLanguage } from "../i18n/LanguageProvider";
import { journeyRequest } from "../../lib/journey-api";
import { fetchWithLocalSession } from "../../lib/session-fetch";
export function PlannerPrivacySettings({ token }: { token: string }) {
  const { locale } = useAppLanguage();
  const vi = locale === "vi";
  const [settings, setSettings] = useState<LearningSettings>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    journeyRequest<LearningSettings>("learning/settings", token)
      .then((s) => {
        if (active) setSettings(s);
      })
      .catch(() => {
        if (active)
          setMessage(
            vi
              ? "Không tải được cài đặt cá nhân hóa."
              : "Could not load personalization settings.",
          );
      });
    return () => {
      active = false;
    };
  }, [token, vi]);
  const change = async (patch: Partial<LearningSettings>) => {
    setBusy(true);
    setMessage("");
    try {
      const next = await journeyRequest<LearningSettings>(
        "learning/settings",
        token,
        patch,
        "PATCH",
      );
      setSettings(next);
    } catch {
      setMessage(vi ? "Không lưu được lựa chọn." : "Could not save settings.");
    } finally {
      setBusy(false);
    }
  };
  const download = async () => {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetchWithLocalSession(
        `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/learning/dataset`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      if (!r.ok) throw new Error();
      const text = await r.text();
      if (!text.trim()) {
        setMessage(
          vi
            ? "Chưa có mẫu đủ điều kiện. Hãy đánh giá lịch trình tốt từ 4–5 sao."
            : "No eligible samples yet. Review a good itinerary with 4–5 stars.",
        );
        return;
      }
      const url = URL.createObjectURL(
        new Blob([text], { type: "application/x-ndjson" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "travel-training-data.jsonl";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setMessage(
        vi ? "Chưa thể xuất dataset." : "Could not export the dataset.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-4 rounded-2xl bg-surface-container-low p-5">
      <h2 className="text-lg font-bold">
        {vi ? "Quyền riêng tư và cá nhân hóa" : "Privacy and personalization"}
      </h2>
      {settings && (
        <div className="space-y-2 text-sm">
          <label className="flex items-start gap-3 leading-6">
            <input
              className="mt-1 h-4 w-4 shrink-0 accent-primary"
              type="checkbox"
              disabled={busy}
              checked={settings.memory_enabled}
              onChange={(e) => change({ memory_enabled: e.target.checked })}
            />
            {vi
              ? "Dùng lịch sử riêng của tôi để gợi ý tốt hơn"
              : "Use my private history for better suggestions"}
          </label>
          <label className="flex items-start gap-3 leading-6">
            <input
              className="mt-1 h-4 w-4 shrink-0 accent-primary"
              type="checkbox"
              disabled={busy}
              checked={settings.training_consent}
              onChange={(e) => change({ training_consent: e.target.checked })}
            />
            {vi
              ? "Cho phép chuẩn bị dataset đã lọc từ lịch trình tôi đánh giá tốt"
              : "Prepare filtered training samples from plans I rate positively"}
          </label>
          <p className="text-xs text-on-surface-variant">
            {vi
              ? "Dataset xuất theo tài khoản, loại bỏ yêu cầu tự do, tên người, địa chỉ, ngày đi cụ thể và mã đặt chỗ. Không tự gửi đi để huấn luyện."
              : "Exports are account-scoped and exclude free-text requests, personal names, addresses, exact dates and booking references. No automatic training upload."}
          </p>
        </div>
      )}
      {settings?.training_consent && (
        <button
          type="button"
          disabled={busy}
          onClick={download}
          className="text-sm text-primary underline"
        >
          {vi
            ? "Tải dataset huấn luyện JSONL"
            : "Download training dataset (JSONL)"}
        </button>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </section>
  );
}
