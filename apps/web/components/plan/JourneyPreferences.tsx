"use client";
import { UiText } from "../i18n/UiText";

import React, { useState, type Dispatch, type SetStateAction } from "react";
import type { PlanningPreferences } from "../../lib/planning-preferences";

export function JourneyPreferences({
  value,
  onChange,
  disabled = false,
}: {
  value: PlanningPreferences;
  onChange: Dispatch<SetStateAction<PlanningPreferences>>;
  disabled?: boolean;
}) {
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");
  const update = (key: keyof PlanningPreferences, next: string | boolean) =>
    onChange((current) => ({ ...current, [key]: next }));
  const inputClass =
    "mt-1 w-full rounded-lg bg-surface-container-high p-3 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/30";
  const field = (
    key: keyof PlanningPreferences,
    label: string,
    placeholder: string,
    type = "text",
  ) => (
    <label className="block text-sm font-semibold">
      <UiText text={label} />
      <input
        type={type}
        value={String(value[key])}
        maxLength={key === "otherRequests" ? 400 : 200}
        min={type === "number" ? 1 : undefined}
        max={type === "number" ? 20 : undefined}
        placeholder={placeholder}
        onChange={(event) => update(key, event.target.value)}
        className={inputClass}
      />
    </label>
  );
  const locate = () => {
    setLocationMessage("");
    if (!navigator.geolocation) {
      setLocationMessage(
        "Location is unavailable. Enter your departure city or address manually.",
      );
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        update(
          "origin",
          `Browser location: ${coords.latitude.toFixed(3)}, ${coords.longitude.toFixed(3)} (accuracy approximately ${Math.round(coords.accuracy)} m)`,
        );
        setLocationMessage(
          "Location added. You can replace it with a city, address or airport.",
        );
        setLocating(false);
      },
      (error) => {
        setLocationMessage(
          error.code === 1
            ? "Location permission was denied. Enter your departure city or address manually."
            : "Could not get your location. Enter your departure city or address manually.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  };

  return (
    <fieldset
      disabled={disabled}
      className="space-y-5 rounded-xl border border-outline-variant/30 p-4"
    >
      <legend className="px-2 font-bold">
        {" "}
        <UiText id="te168f0e23b36" fallback="Your complete journey" />{" "}
      </legend>
      <p className="text-sm text-on-surface-variant">
        {" "}
        <UiText
          id="t53cb1bad22ab"
          fallback="Plan departure, the return journey, stays and local food. All budgets use the currency selected above."
        />{" "}
      </p>
      {field("origin", "Starting point", "Departure city, address or airport")}
      <button
        type="button"
        onClick={locate}
        disabled={locating}
        className="text-sm font-bold text-primary disabled:opacity-50"
      >
        {locating ? (
          <UiText id="t68d9d2f24e39" fallback="Finding location…" />
        ) : (
          <UiText id="t25269b08c790" fallback="Use browser location" />
        )}
      </button>
      <p className="text-xs text-on-surface-variant">
        {" "}
        <UiText
          id="t351735ca48a6"
          fallback="Location is requested only when you tap the button and is included in your plan request when you generate."
        />{" "}
      </p>
      {locationMessage && (
        <p role="status" className="text-sm text-on-surface-variant">
          <UiText text={locationMessage} />
        </p>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.returnToOrigin}
          onChange={(event) => update("returnToOrigin", event.target.checked)}
        />{" "}
        <UiText id="tb0656be8f0df" fallback="Return to starting point" />{" "}
      </label>
      {!value.returnToOrigin &&
        field("endPoint", "Final destination", "Home, another city or airport")}
      <label className="block text-sm font-semibold">
        {" "}
        <UiText id="td7b8421c93bb" fallback="Main transport" />{" "}
        <select
          value={value.transport}
          onChange={(event) => update("transport", event.target.value)}
          className={inputClass}
        >
          {[
            ["suggest", "Suggest suitable transport"],
            ["flight", "Flight"],
            ["train", "Train"],
            ["bus", "Bus"],
            ["car", "Car"],
            ["motorbike", "Motorbike"],
          ].map(([key, label]) => (
            <option key={key} value={key}>
              <UiText text={label} />
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        {field(
          "arrivalTime",
          "Arrival at destination (local time)",
          "",
          "datetime-local",
        )}
        {field(
          "departureTime",
          "Return departure (local time)",
          "",
          "datetime-local",
        )}
      </div>
      <p className="text-xs text-on-surface-variant">
        {" "}
        <UiText
          id="tcaab065b0b34"
          fallback="Use confirmed travel times if you have tickets. Leave blank for an estimated travel plan."
        />{" "}
      </p>
      <label className="block text-sm font-semibold">
        {" "}
        <UiText id="t744b2cc7f90d" fallback="Stay type" />{" "}
        <select
          value={value.lodging}
          onChange={(event) => update("lodging", event.target.value)}
          className={inputClass}
        >
          {[
            ["hotel", "Hotel"],
            ["homestay", "Homestay"],
            ["apartment", "Apartment"],
            ["resort", "Resort"],
            ["hostel", "Hostel"],
            ["already_booked", "Already booked (add details below)"],
            ["none", "No overnight stay"],
          ].map(([key, label]) => (
            <option key={key} value={key}>
              <UiText text={label} />
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        {field("rooms", "Rooms / units", "1", "number")}
        {field(
          "lodgingBudget",
          "Stay budget per room / night",
          "e.g. 800000 VND / room / night",
        )}
      </div>
      {field(
        "lodgingCriteria",
        "Room and stay requirements",
        "Area, beds, children, breakfast, parking, cancellation; booked hotel",
      )}
      {field(
        "diningCriteria",
        "Local restaurants and dietary needs",
        "Local dishes, budget/person, vegetarian, allergies, street food",
      )}
      {field(
        "cafeCriteria",
        "Local café preferences",
        "Specialty coffee, quiet workspace, view, budget/drink, no chains",
      )}
      <label className="block text-sm font-semibold">
        {" "}
        <UiText id="t5c0129c1a205" fallback="Daily pace" />{" "}
        <select
          value={value.pace}
          onChange={(event) => update("pace", event.target.value)}
          className={inputClass}
        >
          <option value="relaxed">
            {" "}
            <UiText id="t21d13052dd90" fallback="Relaxed — more breaks" />{" "}
          </option>
          <option value="balanced">
            {" "}
            <UiText id="t03342dbb856b" fallback="Balanced" />{" "}
          </option>
          <option value="packed">
            {" "}
            <UiText id="td73325b3eddd" fallback="Packed — more stops" />{" "}
          </option>
        </select>
      </label>
      {field(
        "otherRequests",
        "Other priorities",
        "Accessibility, must-see places, avoid crowds, travelling with children…",
      )}
      <p className="text-xs text-on-surface-variant">
        {" "}
        <UiText
          id="tcf744b7d59e4"
          fallback="Hotel and transport suggestions do not reserve rooms or tickets. Confirm availability, prices and dietary requirements with the provider."
        />{" "}
      </p>
    </fieldset>
  );
}
