"use client";

import React, { useEffect, useRef, useState } from "react";
import type { Itinerary } from "@travel/types";
import { journeyRequest } from "../../lib/journey-api";
import { useAppLanguage } from "../i18n/LanguageProvider";
import { useApiErrorText } from "../i18n/UiText";

type ChecklistItem = { id: string; title: string; status: string };
export type ChecklistUpdate = {
  id: string;
  status: string;
  expected_status: string;
};
type Draft = {
  version: number;
  baselineLocks: string[];
  locks: string[];
  baselineChecklist: ChecklistItem[];
  checklist: ChecklistItem[];
};
function updates(draft: Draft): ChecklistUpdate[] {
  return draft.checklist.flatMap((item) => {
    const original = draft.baselineChecklist.find((row) => row.id === item.id)!;
    return original.status === item.status
      ? []
      : [
          {
            id: item.id,
            status: item.status,
            expected_status: original.status,
          },
        ];
  });
}
function locksChanged(draft: Draft) {
  return (
    draft.locks.length !== draft.baselineLocks.length ||
    draft.locks.some((id) => !draft.baselineLocks.includes(id))
  );
}
function changed(draft: Draft) {
  return locksChanged(draft) || updates(draft).length > 0;
}

export function PlanningSelections({
  tripId,
  token,
  plan,
  checklist,
  canEdit,
  disabled,
  onSaved,
  onDirtyChange,
}: {
  tripId: string;
  token: string;
  plan: Itinerary;
  checklist: ChecklistItem[];
  canEdit: boolean;
  disabled?: boolean;
  onSaved: (plan: Itinerary, updates: ChecklistUpdate[]) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { locale } = useAppLanguage();
  const vi = locale === "vi";
  const apiErrorText = useApiErrorText();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const submitting = useRef(false);
  const requestScope = useRef<AbortController | null>(null);
  useEffect(() => () => requestScope.current?.abort(), []);
  const dirty = !!draft && changed(draft);
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  const initial = (): Draft => ({
    version: plan.version!,
    baselineLocks: [...(plan.locked_ids ?? [])],
    locks: [...(plan.locked_ids ?? [])],
    baselineChecklist: checklist.map((item) => ({ ...item })),
    checklist: checklist.map((item) => ({ ...item })),
  });
  const edit = (change: (draft: Draft) => Draft) => {
    setError("");
    setSaved(false);
    setDraft((previous) => {
      const next = change(previous ?? initial());
      return changed(next) ? next : null;
    });
  };
  const save = async () => {
    if (!draft || !dirty || !canEdit || disabled || submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setError("");
    setSaved(false);
    const checklistUpdates = updates(draft);
    const controller = new AbortController();
    requestScope.current = controller;
    try {
      const next = await journeyRequest<Itinerary>(
        `trips/${tripId}/planning`,
        token,
        {
          expected_version: draft.version,
          locked_ids: draft.locks,
          checklist_updates: checklistUpdates,
        },
        "PATCH",
        controller.signal,
      );
      if (controller.signal.aborted) return;
      onSaved(next, checklistUpdates);
      setDraft(null);
      setSaved(true);
    } catch (error) {
      if (controller.signal.aborted) return;
      setError(
        apiErrorText(
          error,
          vi
            ? "Chưa lưu được lựa chọn. Thay đổi chưa lưu vẫn được giữ để thử lại."
            : "Could not save selections. Your unsaved changes are kept for retry.",
        ),
      );
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };
  const blocked = !canEdit || disabled || saving;
  return (
    <section
      className="space-y-4"
      aria-label={vi ? "Lựa chọn lịch trình" : "Planning selections"}
    >
      <h3 className="font-bold">
        {vi ? "Việc cần làm trước chuyến đi" : "Before-trip checklist"}
      </h3>
      {canEdit && (
        <p className="text-sm text-on-surface-variant">
          {vi
            ? "Các ô chọn chỉ được lưu khi bạn bấm Lưu lựa chọn."
            : "Checkbox selections are saved only when you click Save selections."}
        </p>
      )}
      {!checklist.length && (
        <p className="text-sm">
          {vi
            ? "Chưa có việc cần xử lý từ lịch trình."
            : "No checklist tasks from this itinerary yet."}
        </p>
      )}
      {checklist.map((item) => (
        <label key={item.id} className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            disabled={blocked}
            checked={
              (draft?.checklist.find((row) => row.id === item.id)?.status ??
                item.status) === "done"
            }
            onChange={(event) => {
              const status = event.target.checked ? "done" : "todo";
              edit((current) => ({
                ...current,
                checklist: current.checklist.map((row) =>
                  row.id === item.id ? { ...row, status } : row,
                ),
              }));
            }}
          />
          {item.title}
        </label>
      ))}
      <details>
        <summary className="cursor-pointer font-bold">
          {vi ? "Các mục muốn giữ nguyên" : "Items to keep"}
        </summary>
        <div className="mt-3 space-y-2">
          {plan.days.flatMap((day) =>
            day.activities
              .filter((activity) => activity.id)
              .map((activity) => (
                <label
                  key={activity.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    disabled={blocked}
                    checked={(draft?.locks ?? plan.locked_ids ?? []).includes(
                      activity.id!,
                    )}
                    onChange={() =>
                      edit((current) => ({
                        ...current,
                        locks: current.locks.includes(activity.id!)
                          ? current.locks.filter((id) => id !== activity.id)
                          : [...current.locks, activity.id!],
                      }))
                    }
                  />
                  {vi ? "Ngày" : "Day"} {day.day_number}: {activity.name}
                </label>
              )),
          )}
        </div>
      </details>
      {canEdit && (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={!dirty || blocked}
            onClick={() => void save()}
            className="min-h-11 rounded-full bg-primary px-5 py-2 text-on-primary disabled:opacity-40"
          >
            {saving
              ? vi
                ? "Đang lưu…"
                : "Saving…"
              : vi
                ? "Lưu lựa chọn"
                : "Save selections"}
          </button>
          <button
            type="button"
            disabled={!dirty || blocked}
            onClick={() => {
              setDraft(null);
              setError("");
              setSaved(false);
            }}
            className="min-h-11 rounded-full border border-primary px-5 py-2 text-primary disabled:opacity-40"
          >
            {vi ? "Hủy thay đổi" : "Discard changes"}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm">
          {vi ? "Đã lưu lựa chọn." : "Selections saved."}
        </p>
      )}
    </section>
  );
}
