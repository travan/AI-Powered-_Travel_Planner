"use client";

import {
  getCurrencyQuote,
  convertPlannerCurrency,
  withPlannerMoney,
  plannerMoneyKey,
  hasPlannerMoney,
} from "../../lib/planner-currency";
import type { CurrencyQuote } from "@travel/types";
import { ImeTextInput } from "./ImeTextInput";
import { ResolveCitySearch } from "./ResolveCitySearch";
import {
  UiText,
  useUiText,
  useIssueText,
  useApiErrorText,
} from "../i18n/UiText";

import { useAppLanguage } from "../i18n/LanguageProvider";
import {
  emptyPlanner,
  nextPlannerDate,
  setPlannerDeparture,
  needsSuggestedTravelTimes,
  restorePlannerRequest,
  migratePlannerDraft,
  preparePlannerSubmission,
  mergePlannerCity,
  applyPlannerCurrencyDefault,
  type PlannerDraft,
} from "../../lib/planner-model";
import { useTranslations } from "next-intl";
import React, { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  TRIP_STYLES,
  plannerToday,
  journeyRoute,
  routeLabels,
  placeKey,
  countryReference,
  createManualCity,
  validatePlanning,
  type GenerateRequest,
  type PlanningCriteria,
  type Requirement,
  type PlanningIssue,
} from "@travel/types";
import { useCitySearch, usePopularCities } from "@travel/hooks";
import { SiteHeader } from "../layout/SiteHeader";
import { createClient } from "../../lib/supabase/client";
import {
  createSearchDraft,
  claimSearchDraft,
  generateItinerary,
  ApiRequestError,
} from "../../lib/api";
import {
  resolveJourneyLocation,
  journeyRequest,
  type LocationCandidate,
} from "../../lib/journey-api";

import { PlannerDatePicker } from "./PlannerDatePicker";
import { RecentPlanningRequests } from "./RecentPlanningRequests";

const DRAFT_KEY = "horizon.planner.draft.v3";
const INTENT_KEY = "horizon.search.intent";
type CountrySuggestion = {
  country: string;
  names: Record<"en" | "vi", string>;
  cities: { slug: string; name: Record<string, string> }[];
};

const countrySuggestions = new Map<string, { expires: number; result: Promise<CountrySuggestion | null> }>();

function countrySuggestion(query: string) {
  const country = countryReference(query);
  if (!country) return Promise.resolve(null);
  const key = country.country;
  const cached = countrySuggestions.get(key);
  if (cached && cached.expires > Date.now()) return cached.result;
  const result = journeyRequest<{ suggestion: CountrySuggestion | null }>(
    `cities/country-suggestions?q=${encodeURIComponent(country.names.en)}`,
    undefined, undefined, "GET", undefined, "default",
  ).then(({ suggestion }) => suggestion).catch((error) => {
    if (countrySuggestions.get(key)?.result === result) countrySuggestions.delete(key);
    throw error;
  });
  countrySuggestions.set(key, { expires: Date.now() + 300_000, result });
  return result;
}

function CsvField({
  label,
  values,
  onChange,
  hint,
}: {
  label: string;
  values: (string | number)[];
  onChange: (values: string[]) => void;
  hint?: string;
}) {
  const t = useUiText();
  const [raw, setRaw] = useState(values.join(", "));
  useEffect(() => {
    const parsed = raw
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
      .join(",");
    if (parsed !== values.map(String).join(",")) setRaw(values.join(", "));
  }, [values]);
  return (
    <label className="block text-sm font-semibold">
      <UiText text={label} />
      <input
        aria-label={t(label)}
        className="mt-1 w-full rounded-xl border border-outline-variant/30 bg-surface-container-low p-3 text-sm"
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          onChange(
            e.target.value
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean),
          );
        }}
        maxLength={500}
      />
      {hint && (
        <span className="mt-1 block text-xs font-normal">
          <UiText text={hint} />
        </span>
      )}
    </label>
  );
}
const fieldClass =
  "mt-2 min-h-14 w-full rounded-3xl border border-transparent bg-surface-container-high px-5 py-4 text-base font-normal scroll-mt-24 scroll-mb-40 text-on-surface placeholder:text-on-surface-variant/70 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

export function UnifiedPlanner() {
  const { locale: formattingLocale } = useAppLanguage();

  const t = useUiText();
  const ux = useTranslations("plannerUX");
  const plannerFormRef = useRef<HTMLFormElement>(null);
  const explicitlySavedDraft = useRef<PlannerDraft | null>(null);
  const optionalRef = useRef<HTMLDetailsElement>(null);
  const routeRef = useRef<HTMLDetailsElement>(null);
  const datesRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDetailsElement>(null);
  const transportRef = useRef<HTMLDetailsElement>(null);
  const stayRef = useRef<HTMLDetailsElement>(null);
  const diningRef = useRef<HTMLDetailsElement>(null);

  const issueText = useIssueText();
  const apiErrorText = useApiErrorText();
  const { locale } = useAppLanguage();
  const { cities: popularCities = [] } = usePopularCities(
    process.env["NEXT_PUBLIC_API_URL"] ?? "",
  );
  const router = useRouter(),
    params = useSearchParams();
  const [form, setForm] = useState<PlannerDraft>(() => emptyPlanner(locale));
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [locating, setLocating] = useState(false);
  const [dateNotice, setDateNotice] = useState(false);
  const cityQuery = form.destinationQuery ?? "";
  const setCityQuery = (value: string) => {
    if (!value) replacement.current = undefined;
    setForm((draft) => ({ ...draft, destinationQuery: value }));
  };
  const [cityComposing, setCityComposing] = useState(false);
  const [candidates, setCandidates] = useState<LocationCandidate[]>([]);
  const [message, setMessage] = useState("");
  const [proposalNotice, setProposalNotice] = useState<{
    city: CountrySuggestion["cities"][number];
    country: CountrySuggestion["names"];
  }>();
  const [issues, setIssues] = useState<PlanningIssue[]>([]);
  const [error, setError] = useState("");
  const resumed = useRef(false);
  const [currencyBusy, setCurrencyBusy] = useState(false);
  const [currencyFailure, setCurrencyFailure] = useState(false);
  const [currencyRetry, setCurrencyRetry] = useState(0);
  const [currencyQuote, setCurrencyQuote] = useState<CurrencyQuote | null>(
    null,
  );
  const currencyBasis = useRef<{
    original: PlannerDraft;
    lastKey: string;
  } | null>(null);
  useEffect(() => {
    if (!ready) return;
    let active = true;
    const target = locale === "vi" ? "VND" : "USD";
    setCurrencyBusy(false);
    setCurrencyFailure(false);
    if (form.planning.budget.currency === target) return;
    if (!hasPlannerMoney(form)) {
      currencyBasis.current = null;
      setCurrencyQuote(null);
      setForm((draft) => applyPlannerCurrencyDefault(draft, locale));
      return;
    }
    const previous = currencyBasis.current;
    const original =
      previous?.lastKey === plannerMoneyKey(form) ? previous.original : form;
    if (original.planning.budget.currency === target) {
      setForm((current) => {
        const restored = withPlannerMoney(current, original);
        currencyBasis.current = {
          original,
          lastKey: plannerMoneyKey(restored),
        };
        return restored;
      });
      return;
    }
    setCurrencyBusy(true);
    void getCurrencyQuote(original.planning.budget.currency, target)
      .then((quote) => {
        if (!active) return;
        const converted = convertPlannerCurrency(original, quote);
        setForm((current) => {
          // A restored login intent or another update may already have converted.
          if (plannerMoneyKey(current) !== plannerMoneyKey(form))
            return current;
          const next = withPlannerMoney(current, converted);
          currencyBasis.current = { original, lastKey: plannerMoneyKey(next) };
          return next;
        });
        setCurrencyQuote(quote);
      })
      .catch(() => {
        if (active) setCurrencyFailure(true);
      })
      .finally(() => {
        if (active) setCurrencyBusy(false);
      });
    return () => {
      active = false;
    };
  }, [locale, ready, currencyRetry]);
  // Validation describes the current form, never a previous submit attempt.
  useEffect(() => {
    setIssues((previous) =>
      previous.length
        ? validatePlanning(preparePlannerSubmission(form, locale).request)
            .issues
        : previous,
    );
  }, [form, locale]);
  useEffect(() => {
    for (const issue of issues.filter((issue) => issue.severity === "error")) {
      if (issue.field?.startsWith("journey.endpoint")) {
        if (optionalRef.current) optionalRef.current.open = true;
        if (routeRef.current) routeRef.current.open = true;
      }
      if (
        issue.field &&
        !issue.field.startsWith("journey.origin") &&
        !issue.field.startsWith("journey.destinations") &&
        optionalRef.current
      )
        optionalRef.current.open = true;
      if (
        ["end_date", "num_days", "flexible_month", "travelers"].some((field) =>
          issue.field?.startsWith(field),
        ) &&
        datesRef.current
      )
        datesRef.current.scrollIntoView?.({ block: "nearest" });
      if (
        issue.field?.startsWith("travelers") &&
        form.planning.travelers.child_ages.some(
          (age) => age < 0 || age > 17 || !Number.isInteger(age),
        )
      ) {
        if (optionalRef.current) optionalRef.current.open = true;
        if (groupRef.current) groupRef.current.open = true;
      }
      const section = issue.field?.startsWith("transport_preferences")
        ? transportRef.current
        : issue.field?.startsWith("stay_preferences")
          ? stayRef.current
          : null;
      if (section) {
        if (optionalRef.current) optionalRef.current.open = true;
        section.open = true;
        section.scrollIntoView?.({ block: "nearest" });
      }
    }
    const firstError = issues.find((issue) => issue.severity === "error");
    if (firstError)
      requestAnimationFrame(() => {
        const field = document.querySelector<HTMLInputElement>(
          "input[required]:invalid",
        );
        field?.focus();
      });
  }, [issues]);

  const { suggestions } = useCitySearch(
    cityComposing ? "" : cityQuery,
    process.env["NEXT_PUBLIC_API_URL"] ?? "",
  );
  const p = form.planning;
  const [countryProposals, setCountryProposals] = useState<
    Record<string, CountrySuggestion>
  >({});
  const replacement = useRef<string | undefined>(undefined);
  const submissionKey = useRef<{ payload: string; key: string } | null>(null);
  const submitGeneration = async (request: GenerateRequest, token: string) => {
    const payload = JSON.stringify(request);
    if (submissionKey.current?.payload !== payload)
      submissionKey.current = { payload, key: crypto.randomUUID() };
    const result = await generateItinerary(request, token, submissionKey.current.key);
    submissionKey.current = null;
    window.dispatchEvent(new Event("cohorizon:job-status"));
    return result;
  };
  const [countryMatch, setCountryMatch] = useState<{
    key: string;
    suggestion: CountrySuggestion | null;
  }>();
  const country =
    countryMatch?.key === placeKey(cityQuery) ? countryMatch.suggestion : null;
  useEffect(() => {
    const query = cityQuery.trim();
    if (cityComposing || query.length < 2) return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      void countrySuggestion(query)
        .then((suggestion) => {
          if (!abort.signal.aborted)
            setCountryMatch({ key: placeKey(query), suggestion });
        })
        .catch(() => {});
    }, 300);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [cityQuery, cityComposing]);
  const apiBase = process.env["NEXT_PUBLIC_API_URL"] ?? "";
  const { suggestions: origins } = useCitySearch(
    p.journey.origin.source === "manual" ? p.journey.origin.label : "",
    apiBase,
  );
  const { suggestions: endpoints } = useCitySearch(
    p.journey.endpoint?.label ?? "",
    apiBase,
  );
  const displayLocation = (
    location: PlanningCriteria["journey"]["origin"],
    options: typeof origins,
  ) => {
    const matches = [
      ...new Map(options.map((city) => [city.slug, city])).values(),
    ].filter((city) =>
      [city.slug, ...Object.values(city.name)].some(
        (name) => placeKey(name) === placeKey(location.label),
      ),
    );
    const match = matches.length === 1 ? matches[0] : undefined;
    return match
      ? { ...location, city_slug: match.slug, names: match.name }
      : location;
  };
  const destinationLabels = (city: PlannerDraft["cities"][number]) =>
    city.names ??
    [...popularCities, ...suggestions].find((entry) => entry.slug === city.slug)
      ?.name;
  const previewJourney = {
    ...p.journey,
    origin: displayLocation(p.journey.origin, [...origins, ...popularCities]),
    endpoint:
      p.journey.endpoint &&
      displayLocation(p.journey.endpoint, [...endpoints, ...popularCities]),
  };
  const previewRoute = routeLabels(
    journeyRoute(
      previewJourney,
      form.cities.map((city) => ({
        slug: city.slug,
        label: city.name,
        names: destinationLabels(city),
      })),
    ),
    locale,
  );
  const change = <K extends keyof PlanningCriteria>(
    key: K,
    value: Partial<PlanningCriteria[K]>,
  ) =>
    setForm((f) => ({
      ...f,
      planning: {
        ...f.planning,
        [key]: { ...(f.planning[key] as object), ...(value as object) },
      },
    }));
  const requestFor = (f: PlannerDraft) =>
    preparePlannerSubmission(f, locale, suggestions).request;
  const prepareCurrent = () => {
    const origin =
      plannerFormRef.current?.querySelector<HTMLInputElement>(
        '[data-planner-field="journey.origin"]',
      )?.value ?? form.planning.journey.origin.label;
    const destinationQuery =
      plannerFormRef.current?.querySelector<HTMLInputElement>(
        '[data-testid="web-plan-city-input"]',
      )?.value ?? cityQuery;
    const journey = form.planning.journey;
    const currentOrigin =
      origin === journey.origin.label
        ? journey.origin
        : { label: origin, source: "manual" as const };
    const { names: _originNames, ...submissionOrigin } = displayLocation(
      currentOrigin,
      [...origins, ...popularCities],
    );
    const draft = {
      ...form,
      planning: {
        ...form.planning,
        journey: { ...journey, origin: submissionOrigin },
      },
    };
    return {
      ...preparePlannerSubmission(
        { ...draft, destinationQuery },
        locale,
        suggestions,
      ),
      pendingDestination: destinationQuery.trim(),
    };
  };
  const redirectToSignIn = async (request: GenerateRequest) => {
    const guestKey =
      localStorage.getItem("horizon.search.guest_key") ??
      `guest-${crypto.randomUUID()}`;
    localStorage.setItem("horizon.search.guest_key", guestKey);
    const intent: {
      request: GenerateRequest;
      guestKey: string;
      createdAt: number;
      draftId?: string;
    } = { request, guestKey, createdAt: Date.now() };
    try {
      intent.draftId = (
        await createSearchDraft({
          guest_key: guestKey,
          prompt_text: request.prompt_text ?? "Lập hành trình",
          search_payload: request,
        })
      ).id;
    } catch {
      /* Session storage preserves the intent when drafts are unavailable. */
    }
    sessionStorage.setItem(INTENT_KEY, JSON.stringify(intent));
    const resume = `/plan?resumeGenerate=1${intent.draftId ? `&draftId=${intent.draftId}` : ""}`;
    router.push(`/login?redirectTo=${encodeURIComponent(resume)}`);
  };
  const navigateResult = (
    result: Awaited<ReturnType<typeof generateItinerary>>,
  ) => {
    if (result.status === "unsupported") throw new Error(result.message);
    if (result.status === "queued")
      router.push(
        result.stream_url?.includes("/stream/")
          ? `/trips?source=queued&id=${encodeURIComponent(result.job_id)}`
          : `/plan/jobs/${result.job_id}`,
      );
    else if (result.itinerary_id)
      router.push(
        `/trips?source=cached&id=${encodeURIComponent(result.itinerary_id)}`,
      );
    else throw new Error("Chưa có mã lịch trình.");
  };
  useEffect(() => {
    try {
      const stored =
        localStorage.getItem(DRAFT_KEY) ??
        localStorage.getItem("horizon.journey.draft.v2");
      if (stored) {
        const draft = JSON.parse(stored);
        if (draft.planning?.schema_version === 2) {
          const recovered = {
            ...emptyPlanner(),
            ...draft,
            step:
              Number.isInteger(draft.step) && draft.step >= 0 && draft.step <= 4
                ? draft.step
                : 0,
          } as PlannerDraft;
          // Exercise the same structured contract before rendering restored data.
          // A partially written/older draft must never crash a later wizard step.
          requestFor(recovered);
          validatePlanning(requestFor(recovered));
          if (
            !Array.isArray(recovered.planning.experience_preferences.interests)
          )
            throw new Error("Invalid interests");
          setForm(migratePlannerDraft(recovered));
        }
      }
      if (params.get("city")) {
        const slug = params.get("city")!;
        setForm((f) => ({ ...f, cities: [{ slug, name: slug }] }));
      }
    } catch {
      /* Keep an editable clean form when an old draft cannot be decoded. */
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    // An explicit save may include the location the user chose. Do not let the
    // state update from preparing that snapshot immediately overwrite it.
    if (explicitlySavedDraft.current === form) return;
    explicitlySavedDraft.current = null;
    // Exact browser coordinates are saved only through explicit Save draft/Generate.
    const copy = structuredClone(form);
    if (copy.planning.journey.origin.source === "browser")
      copy.planning.journey.origin = { label: "", source: "manual" };
    else {
      delete copy.planning.journey.origin.latitude;
      delete copy.planning.journey.origin.longitude;
      delete copy.planning.journey.origin.accuracy_m;
    }
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(copy));
    } catch {
      setMessage(
        t("Trình duyệt không lưu được nháp; bạn vẫn có thể tạo lịch trình."),
      );
    }
  }, [form, ready]);
  useEffect(() => {
    if (!ready || params.get("resumeGenerate") !== "1" || resumed.current)
      return;
    resumed.current = true;
    setBusy(true);
    void (async () => {
      try {
        const raw = sessionStorage.getItem(INTENT_KEY);
        const intent = raw ? JSON.parse(raw) : null;
        const {
          data: { session },
        } = await createClient().auth.getSession();
        if (!session?.access_token) {
          setError(t("Đăng nhập để tiếp tục tạo lịch trình."));
          return;
        }
        let request = intent?.request as GenerateRequest | undefined;
        const draftId = params.get("draftId");
        const guestKey =
          intent?.guestKey ?? localStorage.getItem("horizon.search.guest_key");
        if (draftId && guestKey) {
          try {
            request = (
              await claimSearchDraft(draftId, guestKey, session.access_token)
            ).search_payload;
          } catch (e) {
            if (!request) throw e;
          }
        }
        window.history.replaceState(null, "", "/plan");
        if (!request) {
          setError(ux("draft_expired"));
          return;
        }
        let restored = restorePlannerRequest(request);
        setForm(restored);
        const targetCurrency = locale === "vi" ? "VND" : "USD";
        if (restored.planning.budget.currency !== targetCurrency) {
          if (hasPlannerMoney(restored)) {
            const quote = await getCurrencyQuote(
              restored.planning.budget.currency,
              targetCurrency,
            );
            restored = convertPlannerCurrency(restored, quote);
            setCurrencyQuote(quote);
          } else restored = applyPlannerCurrencyDefault(restored, locale);
        }
        const prepared = preparePlannerSubmission(restored, locale);
        setForm(prepared.draft);
        request = prepared.request;
        const checked = validatePlanning(request);
        if (!checked.valid) {
          setIssues(checked.issues);
          return;
        }
        window.history.replaceState(null, "", "/plan");
        setBusy(true);
        navigateResult(await submitGeneration(request, session.access_token));
        sessionStorage.removeItem(INTENT_KEY);
      } catch (e) {
        if (
          e instanceof ApiRequestError &&
          e.code === "CURRENCY_RATE_UNAVAILABLE"
        )
          setCurrencyFailure(true);
        window.history.replaceState(null, "", "/plan");
        if (e instanceof ApiRequestError && e.status === 404)
          setError(ux("draft_expired"));
        else setError(apiErrorText(e, "Không thể khôi phục nháp."));
      } finally {
        setBusy(false);
      }
    })();
  }, [ready]);
  const addCity = (
    slug: string,
    name: string,
    names?: Record<string, string>,
  ) => {
    const labels =
      names ??
      [...popularCities, ...suggestions].find((c) => c.slug === slug)?.name;
    const replacing = replacement.current;
    replacement.current = undefined;
    const city = { slug, name, ...(labels ? { names: labels } : {}) };
    setForm((draft) => ({
      ...draft,
      cities: replacing
        ? draft.cities
            .map((entry) => (entry.slug === replacing ? city : entry))
            .reduce<
              PlannerDraft["cities"]
            >((selected, entry) => mergePlannerCity(selected, entry), [])
        : mergePlannerCity(draft.cities, city),
      destinationQuery: "",
    }));
  };
  const selectCountryCity = (
    match: CountrySuggestion,
    slug: string,
    name: string,
    names?: Record<string, string>,
  ) => {
    setCountryProposals((previous) => ({ ...previous, [slug]: match }));
    addCity(slug, name, names);
  };
  const acceptDestination = async (query: string) => {
    const key = placeKey(query);
    const match =
      countryMatch?.key === key
        ? countryMatch.suggestion
        : await countrySuggestion(query).catch(() => null);
    if (match) {
      setCountryMatch({ key, suggestion: match });
      const proposal = match.cities[0];
      if (proposal) {
        selectCountryCity(
          match,
          proposal.slug,
          proposal.name[locale] ?? proposal.name.en ?? proposal.slug,
          proposal.name,
        );
        setProposalNotice({ city: proposal, country: match.names });
      }
      return true;
    }
    return false;
  };
  const locate = () => {
    setError("");
    setMessage("");
    if (!navigator.geolocation) {
      setError(t("Không hỗ trợ định vị. Hãy nhập điểm xuất phát."));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        setForm((f) => ({
          ...f,
          planning: {
            ...f.planning,
            journey: {
              ...f.planning.journey,
              origin: {
                label: "Vị trí hiện tại",
                source: "browser",
                latitude: Number(coords.latitude.toFixed(3)),
                longitude: Number(coords.longitude.toFixed(3)),
                accuracy_m: coords.accuracy,
              },
            },
          },
        }));
        try {
          const result = await resolveJourneyLocation({
            latitude: coords.latitude,
            longitude: coords.longitude,
          });
          setCandidates(result.candidates);
          setMessage(
            result.candidates.length
              ? "Chọn thành phố/đầu mối phù hợp bên dưới. Khoảng cách là đường thẳng, không phải tuyến đường."
              : "Đã lấy tọa độ. Chưa có ứng viên trong catalog; bạn có thể nhập tên điểm xuất phát.",
          );
        } catch {
          setMessage(
            t(
              "Đã lấy tọa độ; chưa tải được địa điểm gần đây. Có thể nhập tay.",
            ),
          );
        } finally {
          setLocating(false);
        }
      },
      (e) => {
        setLocating(false);
        setError(
          e.code === 1
            ? "Bạn đã từ chối định vị. Hãy nhập điểm xuất phát."
            : "Định vị hết thời gian hoặc không khả dụng. Hãy nhập điểm xuất phát.",
        );
      },
      { timeout: 10000, maximumAge: 60000, enableHighAccuracy: false },
    );
  };
  const generate = async () => {
    if (currencyBusy || currencyFailure) return;
    setBusy(true);
    setError("");
    const { draft, request, pendingDestination } = prepareCurrent();
    try {
      const local = validatePlanning(request);
      if (!local.valid) {
        setIssues(local.issues);
        return;
      }
      if (pendingDestination && (await acceptDestination(pendingDestination)))
        return;
      // Older drafts may contain an unresolved country saved as a free-text city.
      for (const city of form.cities.filter(
        (entry) =>
          !entry.names && entry.slug === createManualCity(entry.name).slug,
      )) {
        const match = await countrySuggestion(city.name).catch(() => null);
        if (!match) continue;
        replacement.current = city.slug;
        setForm({ ...draft, destinationQuery: city.name });
        setCountryMatch({ key: placeKey(city.name), suggestion: match });
        return;
      }
      setForm(draft);
      const checked = validatePlanning(request);
      setIssues(checked.issues);
      if (!checked.valid) return;
      const {
        data: { session },
      } = await createClient().auth.getSession();
      if (!session?.access_token) {
        await redirectToSignIn(request);
        return;
      }
      navigateResult(await submitGeneration(request, session.access_token));
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) {
        await createClient().auth.signOut();
        await redirectToSignIn(request);
        return;
      }
      setError(
        apiErrorText(e, "Không thể tạo lịch trình. Bạn có thể thử lại."),
      );
    } finally {
      setBusy(false);
    }
  };
  const fieldError = (field: string) => {
    const matching = issues.filter(
      (issue) => issue.severity === "error" && issue.field?.startsWith(field),
    );
    return matching.length ? (
      <span className="mt-1 block text-sm font-normal text-error" role="alert">
        {matching.map((issue) => issueText(issue)).join(" ")}
      </span>
    ) : null;
  };
  const compactSummary = [
    form.dated
      ? `${form.start || ux("departure_short")} → ${form.end || ux("return_short")}`
      : `${form.days} ${ux("days_short")}${form.flexible && form.month ? ` · ${form.month}` : ""}`,
    ux("travelers_short", {
      count: p.travelers.adults + p.travelers.child_ages.length,
    }),
    p.budget.total == null
      ? ux("cost_auto_short")
      : `${p.budget.total.toLocaleString(locale)} ${p.budget.currency}`,
  ].join(" · ");
  const input = (
    label: string,
    value: string | number,
    onChange: (value: string) => void,
    type = "text",
    hint?: string,
    placeholder?: string,
    required = false,
    issueField?: string,
  ) => (
    <label className="block text-sm font-semibold">
      <UiText text={label} />{" "}
      {required && (
        <span aria-hidden="true" className="text-error">
          *
        </span>
      )}
      {type === "text" ? (
        <ImeTextInput
          aria-label={t(label)}
          required={required}
          aria-required={required || undefined}
          placeholder={placeholder}
          className={fieldClass}
          type={type}
          value={value}
          onValueChange={onChange}
          data-planner-field={issueField}
          aria-invalid={
            issueField
              ? issues.some(
                  (issue) =>
                    issue.severity === "error" &&
                    issue.field?.startsWith(issueField),
                )
              : undefined
          }
          maxLength={500}
        />
      ) : (
        <input
          aria-label={t(label)}
          required={required}
          aria-required={required || undefined}
          placeholder={placeholder}
          className={fieldClass}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={500}
        />
      )}
      {issueField && fieldError(issueField)}
      {hint && (
        <span className="mt-1 block text-xs font-normal text-on-surface-variant">
          <UiText text={hint} />
        </span>
      )}
    </label>
  );
  const select = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    options: [string, string][],
  ) => (
    <label className="block text-sm font-semibold">
      <UiText text={label} />
      <select
        aria-label={t(label)}
        className={fieldClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {t(l)}
          </option>
        ))}
      </select>
    </label>
  );
  const requirements = (
    label: string,
    values: Requirement[],
    update: (next: Requirement[]) => void,
  ) => (
    <div className="space-y-2">
      <p className="text-sm font-semibold">
        <UiText text={label} />
      </p>
      {values.map((r, i) => (
        <div className="flex gap-2" key={i}>
          <input
            aria-label={`${label} ${i + 1}`}
            className={fieldClass}
            value={r.value}
            onChange={(e) =>
              update(
                values.map((x, j) =>
                  j === i ? { ...x, value: e.target.value } : x,
                ),
              )
            }
            maxLength={250}
          />
          <select
            aria-label={`${t("Priority")} ${t(label)} ${i + 1}`}
            className={fieldClass}
            value={r.priority}
            onChange={(e) =>
              update(
                values.map((x, j) =>
                  j === i
                    ? {
                        ...x,
                        priority: e.target.value as Requirement["priority"],
                      }
                    : x,
                ),
              )
            }
          >
            <option value="preferred">
              {" "}
              <UiText id="t36b9b67977ed" fallback="Ưu tiên" />{" "}
            </option>
            <option value="required">
              {" "}
              <UiText id="t2117c8aadada" fallback="Bắt buộc" />{" "}
            </option>
          </select>
          <button
            type="button"
            onClick={() => update(values.filter((_, j) => j !== i))}
            aria-label={`${t("Remove criterion")} ${i + 1}`}
          >
            {" "}
            <UiText id="t67fba2f357af" fallback="×" />{" "}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-sm font-bold text-primary"
        onClick={() =>
          update([...values, { value: "", priority: "preferred" }])
        }
      >
        {" "}
        <UiText id="tc185d60ce84e" fallback="+ Thêm tiêu chí" />{" "}
      </button>
    </div>
  );
  const summary = (
    <div className="space-y-4 rounded-2xl border border-primary/20 bg-surface-container-low p-5">
      <h2 className="text-lg font-bold">
        {" "}
        <UiText id="td5c955769085" fallback="Chuyến đi của bạn" />{" "}
      </h2>
      <p>{previewRoute.join(" → ")}</p>
      <p>
        {form.dated
          ? `${form.start || t("Ngày đi")} → ${form.end || t("Ngày về")}`
          : `${form.days} ${t("days")}${form.flexible ? ` · ${form.month || ux("travel_month")}` : ""}`}{" "}
        · {p.travelers.adults}{" "}
        <UiText id="tbb92615a46ea" fallback="người lớn" />{" "}
        {p.travelers.child_ages.length
          ? ` + ${p.travelers.child_ages.length} ${t("children")}`
          : ""}
      </p>
      <p>
        {p.budget.total?.toLocaleString(formattingLocale) ??
          t("Để hệ thống ước tính")}{" "}
        {p.budget.currency}{" "}
        <strong>
          {" "}
          <UiText id="tff0dcbfb7f54" fallback="cho cả nhóm" />{" "}
        </strong>
      </p>
      <p>
        {p.stay_preferences.rooms}{" "}
        <UiText id="t762c646d1e2a" fallback="phòng ·" />{" "}
        {p.experience_preferences.pace === "relaxed" ? (
          <UiText id="t1edc3f8c1d05" fallback="Thư thả" />
        ) : p.experience_preferences.pace === "packed" ? (
          <UiText id="tc45603f32035" fallback="Nhiều hoạt động" />
        ) : (
          <UiText id="t9fe59d4b6467" fallback="Cân bằng" />
        )}
      </p>
      <p className="text-xs text-on-surface-variant">
        {" "}
        <UiText
          id="t807eb2228e80"
          fallback="Giá là ước tính. App không đặt phòng/vé hay xác nhận tình trạng còn chỗ."
        />{" "}
      </p>
    </div>
  );
  if (!ready)
    return (
      <p className="p-8" role="status">
        {" "}
        <UiText id="t53b51fb94d14" fallback="Đang khôi phục nháp…" />{" "}
      </p>
    );
  return (
    <div className="min-h-screen bg-background text-on-surface">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 pt-6 pb-36 lg:pb-12">
        <h1 className="mb-5 font-headline text-2xl font-bold">
          {ux("compact_heading")}
        </h1>
        <form
          ref={plannerFormRef}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void generate();
          }}
        >
          <fieldset disabled={busy || currencyBusy} className="space-y-5">
            <legend className="sr-only">{t("Plan your trip")}</legend>
            <div
              className="space-y-5 rounded-3xl border border-outline-variant/30 bg-white p-5 sm:p-8"
              data-testid="planner-essential-panel"
            >
              {input(
                ux("origin_label"),
                p.journey.origin.label,
                (v) =>
                  change("journey", {
                    origin: { label: v, source: "manual" },
                  }),
                "text",
                undefined,
                ux("origin_placeholder"),
                true,
                "journey.origin",
              )}
              <label className="block text-sm font-semibold">
                {" "}
                {ux("destination_label")}{" "}
                {form.cities.length === 0 && (
                  <span aria-hidden="true" className="text-error">
                    *
                  </span>
                )}
                {form.cities.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-primary">
                    {ux("destinations_selected", {
                      count: form.cities.length,
                    })}
                  </span>
                )}
                <ImeTextInput
                  className={fieldClass}
                  aria-label={ux("destination_label")}
                  data-testid="web-plan-city-input"
                  aria-required={form.cities.length === 0 || undefined}
                  required={form.cities.length === 0}
                  value={cityQuery}
                  placeholder={
                    form.cities.length
                      ? ux("add_destination_optional")
                      : ux("destination_placeholder")
                  }
                  onValueChange={setCityQuery}
                  onCompositionStart={() => setCityComposing(true)}
                  onCompositionEnd={() => setCityComposing(false)}
                  aria-invalid={issues.some(
                    (issue) => issue.code === "DESTINATION_REQUIRED",
                  )}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && cityQuery.trim()) {
                      e.preventDefault();
                      const query = cityQuery.trim();
                      const matches = suggestions.filter((city) =>
                        [city.slug, ...Object.values(city.name)].some(
                          (name) => placeKey(name) === placeKey(query),
                        ),
                      );
                      const city =
                        !country && matches.length === 1
                          ? matches[0]
                          : undefined;
                      if (city) {
                        addCity(
                          city.slug,
                          city.name[locale] ?? city.name.en ?? city.slug,
                          city.name,
                        );
                        return;
                      }
                      setBusy(true);
                      void acceptDestination(query)
                        .then((handled) => {
                          if (handled) return;
                          const manual = createManualCity(query);
                          addCity(manual.slug, manual.name);
                        })
                        .finally(() => setBusy(false));
                    }
                  }}
                />
              </label>
              {fieldError("journey.destinations")}
              {cityQuery.trim() && (
                <div className="space-y-2">
                  {country && (
                    <p className="text-sm" role="status">
                      {country.cities.length
                        ? (locale === "vi"
                            ? "Thành phố đề xuất tại "
                            : "Suggested cities in ") + country.names[locale]
                        : (locale === "vi"
                            ? "Hãy tìm một thành phố tại "
                            : "Find a city in ") + country.names[locale]}
                    </p>
                  )}
                  {(country?.cities ?? suggestions).map((city) => (
                    <button
                      type="button"
                      key={city.slug}
                      onClick={() => {
                        const name =
                          city.name[locale] ?? city.name.en ?? city.slug;
                        if (country)
                          selectCountryCity(
                            country,
                            city.slug,
                            name,
                            city.name,
                          );
                        else addCity(city.slug, name, city.name);
                      }}
                      className="block text-primary"
                    >
                      {city.name[locale] ?? city.name.en ?? city.slug}
                      {country && ` (${country.names[locale]})`}
                    </button>
                  ))}
                  <details
                    className="text-sm"
                    open={country?.cities.length === 0 || undefined}
                  >
                    <summary className="cursor-pointer text-primary">
                      {ux("search_help")}
                    </summary>
                    <ResolveCitySearch
                      key={country?.country ?? "city"}
                      query={cityQuery}
                      country={
                        country
                          ? { code: country.country, name: country.names.en }
                          : undefined
                      }
                      onSelect={(slug, name, names) => {
                        if (country)
                          selectCountryCity(country, slug, name, names);
                        else addCity(slug, name, names);
                      }}
                    />
                  </details>
                </div>
              )}
              <ol className="space-y-2">
                {form.cities.map((c, i) => (
                  <li
                    key={c.slug}
                    data-testid="web-plan-selected-city"
                    className="flex items-center justify-between rounded-lg bg-surface-container-low p-3"
                  >
                    <span>
                      {i + 1}.{" "}
                      {c.names?.[locale] ??
                        [...popularCities, ...suggestions].find(
                          (city) => city.slug === c.slug,
                        )?.name[locale] ??
                        c.name}
                    </span>
                    {countryProposals[c.slug] && (
                      <button
                        type="button"
                        className="text-sm font-semibold text-primary underline"
                        onClick={() => {
                          const match = countryProposals[c.slug]!;
                          const name = match.names[locale];
                          replacement.current = c.slug;
                          setCountryMatch({
                            key: placeKey(name),
                            suggestion: match,
                          });
                          setCityQuery(name);
                          plannerFormRef.current
                            ?.querySelector<HTMLInputElement>(
                              '[data-testid="web-plan-city-input"]',
                            )
                            ?.focus();
                        }}
                      >
                        {locale === "vi" ? "Đổi thành phố" : "Change city"}
                      </button>
                    )}
                    <div className="flex gap-3">
                      <button
                        type="button"
                        aria-label={`${t("Move city earlier")}: ${c.name}`}
                        disabled={i === 0}
                        onClick={() =>
                          setForm((f) => {
                            const cities = [...f.cities];
                            [cities[i - 1], cities[i]] = [
                              cities[i]!,
                              cities[i - 1]!,
                            ];
                            return { ...f, cities };
                          })
                        }
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`${t("Remove city")}: ${c.name}`}
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            cities: f.cities.filter((x) => x.slug !== c.slug),
                          }))
                        }
                      >
                        {" "}
                        <UiText id="t67fba2f357af" fallback="×" />{" "}
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
              {previewRoute.length > 1 && (
                <p
                  className="rounded-xl bg-primary-fixed/20 p-3 text-sm font-semibold"
                  data-testid="web-plan-route"
                >
                  {previewRoute.join(" → ")}
                </p>
              )}
              {issues.some(
                (issue) =>
                  issue.severity === "error" &&
                  !["ORIGIN_REQUIRED", "DESTINATION_REQUIRED"].includes(
                    issue.code,
                  ),
              ) && (
                <section
                  role="alert"
                  className="rounded-xl bg-error/10 p-4 text-sm text-error"
                >
                  <p className="font-semibold">{ux("fix_required")}</p>
                  <ul>
                    {issues
                      .filter(
                        (issue) =>
                          issue.severity === "error" &&
                          !["ORIGIN_REQUIRED", "DESTINATION_REQUIRED"].includes(
                            issue.code,
                          ),
                      )
                      .map((issue) => (
                        <li key={issue.code}>{issueText(issue)}</li>
                      ))}
                  </ul>
                </section>
              )}
              {error && (
                <p
                  role="alert"
                  data-testid="web-plan-error"
                  className="rounded-xl bg-error/10 p-3 text-sm text-error"
                >
                  <UiText text={error} />
                </p>
              )}
              {currencyBusy && (
                <p role="status" className="text-sm text-primary">
                  {ux("currency_converting")}
                </p>
              )}
              {currencyFailure && (
                <div
                  role="alert"
                  className="rounded-xl bg-error/10 p-3 text-sm text-error"
                >
                  <p>
                    {ux("currency_failed", { currency: p.budget.currency })}
                  </p>
                  <button
                    type="button"
                    className="mt-2 font-semibold underline"
                    onClick={() => setCurrencyRetry((value) => value + 1)}
                  >
                    {ux("currency_retry")}
                  </button>
                </div>
              )}
              {currencyQuote && !currencyBusy && !currencyFailure && (
                <p role="status" className="text-xs text-on-surface-variant">
                  {ux("currency_converted")} ·{" "}
                  {new Date(currencyQuote.updated_at).toLocaleDateString(
                    locale,
                  )}{" "}
                  ·{" "}
                  <a
                    href="https://www.exchangerate-api.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    ExchangeRate-API
                  </a>
                </p>
              )}
              <div className="flex flex-col-reverse gap-3 pt-2">
                <button
                  type="submit"
                  disabled={currencyBusy || currencyFailure}
                  data-testid="web-plan-generate"
                  className="min-h-16 w-full rounded-full bg-primary px-6 py-4 text-lg font-bold text-on-primary shadow-md transition-colors hover:bg-primary/90"
                >
                  {busy ? (
                    <UiText id="ta85e73bea60e" fallback="Đang gửi yêu cầu…" />
                  ) : (
                    <UiText id="ta0352f1292cc" fallback="Tạo hành trình" />
                  )}
                </button>
              </div>

              {proposalNotice &&
                form.cities.some(
                  (city) => city.slug === proposalNotice.city.slug,
                ) && (
                  <p role="status" className="text-sm text-primary">
                    {locale === "vi"
                      ? `Đã đề xuất ${proposalNotice.city.name.vi ?? proposalNotice.city.name.en} (${proposalNotice.country.vi}). Bạn có thể đổi điểm trước khi tạo.`
                      : `Suggested ${proposalNotice.city.name.en} (${proposalNotice.country.en}). You can change the stop before generating.`}
                  </p>
                )}
              {message && (
                <p role="status" className="text-sm text-primary">
                  <UiText text={message} />
                </p>
              )}
            </div>
            <details
              ref={optionalRef}
              className="rounded-2xl border border-outline-variant/30 bg-surface p-4 sm:p-6"
              data-testid="planner-optional-settings"
            >
              <summary className="cursor-pointer list-none rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                <span className="flex items-center justify-between gap-3 font-semibold">
                  {ux("compact_customize")}
                  <span aria-hidden="true">⌄</span>
                </span>
                <span
                  className="mt-1 block text-sm text-on-surface-variant"
                  data-testid="planner-settings-summary"
                >
                  {compactSummary}
                </span>
              </summary>
              <div
                className="mt-6 space-y-6"
                data-testid="planner-preferences-panel"
              >
                <div
                  className="grid min-w-0 gap-x-6 gap-y-3 md:grid-cols-2"
                  data-testid="planner-time-budget"
                >
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 md:col-start-1 md:row-start-1">
                    <h2 className="text-sm font-bold uppercase tracking-widest text-on-surface-variant">
                      {ux("when_heading")}
                    </h2>
                    <select
                      aria-label={ux("date_mode")}
                      className="max-w-full rounded-lg bg-surface-container-low px-2 py-1 text-sm font-semibold text-primary focus:ring-2 focus:ring-primary/30"
                      value={
                        form.dated ? "dates" : form.flexible ? "month" : "days"
                      }
                      onChange={(e) => {
                        const mode = e.target.value;
                        setDateNotice(false);
                        setForm((f) => ({
                          ...f,
                          dated: mode === "dates",
                          flexible: mode === "month",
                          month: f.month || plannerToday().slice(0, 7),
                        }));
                      }}
                    >
                      <option value="days">{ux("use_day_count")}</option>
                      <option value="month">{ux("flexible_month")}</option>
                      <option value="dates">{ux("pick_dates")}</option>
                    </select>
                  </div>
                  <div
                    ref={datesRef}
                    className="min-w-0 md:col-start-1 md:row-start-2"
                    data-testid="planner-primary-time"
                  >
                    {form.dated ? (
                      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                        <PlannerDatePicker
                          label={t("Ngày đi")}
                          value={form.start}
                          className={fieldClass}
                          onChange={(start) => {
                            setForm((f) => setPlannerDeparture(f, start));
                            if (!form.end || form.end <= start)
                              setDateNotice(true);
                          }}
                        />
                        <PlannerDatePicker
                          label={t("Ngày về")}
                          value={form.end}
                          className={fieldClass}
                          min={nextPlannerDate(form.start)}
                          disabled={!nextPlannerDate(form.start)}
                          onChange={(end) => {
                            if (end > form.start) {
                              setForm((f) => ({ ...f, end }));
                              setDateNotice(false);
                            }
                          }}
                        />
                      </div>
                    ) : (
                      <div
                        className={
                          form.flexible
                            ? "grid min-w-0 items-end gap-3 sm:grid-cols-2"
                            : ""
                        }
                      >
                        {form.flexible && (
                          <label className="block text-sm font-semibold">
                            {ux("travel_month")}
                            <input
                              type="month"
                              required
                              aria-label={ux("travel_month")}
                              className={fieldClass}
                              min={plannerToday().slice(0, 7)}
                              value={form.month ?? ""}
                              onChange={(e) =>
                                setForm((f) => ({
                                  ...f,
                                  month: e.target.value,
                                }))
                              }
                            />
                          </label>
                        )}
                        {input(
                          ux("days_label"),
                          form.days,
                          (v) => setForm((f) => ({ ...f, days: Number(v) })),
                          "number",
                        )}
                      </div>
                    )}
                  </div>
                  <details className="text-xs leading-relaxed text-on-surface-variant md:col-start-1 md:row-start-3">
                    <summary className="cursor-pointer">
                      {ux("time_help")}
                    </summary>
                    {dateNotice ? (
                      <span role="status">{ux("return_adjusted")}</span>
                    ) : (
                      ux(
                        form.flexible && !form.dated
                          ? "flexible_month_hint"
                          : "time_hint",
                      )
                    )}
                  </details>
                  <h2 className="flex items-center text-sm font-bold uppercase tracking-widest text-on-surface-variant md:col-start-2 md:row-start-1">
                    {ux("budget_heading")}
                  </h2>
                  <div
                    className="grid min-w-0 grid-cols-[minmax(0,1fr)_100px] items-end gap-3 md:col-start-2 md:row-start-2"
                    data-testid="planner-primary-budget"
                  >
                    {input(
                      `${ux("budget_label")} (${p.budget.currency})`,
                      p.budget.total ?? "",
                      (v) =>
                        change("budget", { total: v ? Number(v) : undefined }),
                      "number",
                      undefined,
                      ux("budget_placeholder"),
                    )}
                    {select(
                      t("Currency"),
                      p.budget.currency,
                      (currency) => change("budget", { currency }),
                      [
                        "VND",
                        "USD",
                        "EUR",
                        "GBP",
                        "JPY",
                        "AUD",
                        "CAD",
                        "SGD",
                        "THB",
                      ].map((c) => [c, c]),
                    )}
                  </div>
                </div>
                <div className="space-y-3">
                  <h2 className="text-sm font-bold uppercase tracking-widest text-on-surface-variant">
                    {t("Travel style")}
                  </h2>
                  <div
                    className="grid grid-cols-2 gap-2 sm:grid-cols-4"
                    role="group"
                    aria-label={t("Travel style")}
                  >
                    {[
                      { key: "mixed", label: "Mixed", emoji: "🌿" },
                      ...TRIP_STYLES,
                    ].map((style) => (
                      <button
                        key={style.key}
                        type="button"
                        aria-pressed={form.style === style.key}
                        onClick={() =>
                          setForm((f) => ({ ...f, style: style.key }))
                        }
                        className={`flex min-h-12 items-center justify-center gap-2 rounded-full px-3 py-3 text-sm font-bold transition-colors ${form.style === style.key ? "bg-primary text-on-primary" : "bg-surface-container-high text-on-surface-variant hover:bg-primary/10"}`}
                      >
                        <span aria-hidden="true">{style.emoji}</span>
                        {t(style.label)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <h2 className="text-sm font-bold uppercase tracking-widest text-on-surface-variant">
                    {t("Số người lớn")}
                  </h2>
                  <div className="flex flex-wrap items-center gap-4">
                    <button
                      type="button"
                      aria-label={ux("fewer_adults")}
                      disabled={p.travelers.adults <= 1}
                      onClick={() =>
                        change("travelers", { adults: p.travelers.adults - 1 })
                      }
                      className="h-11 w-11 rounded-full bg-surface-container-high text-2xl font-bold text-primary disabled:opacity-40"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={20 - p.travelers.child_ages.length}
                      aria-label={t("Số người lớn")}
                      value={p.travelers.adults}
                      onChange={(e) =>
                        change("travelers", { adults: Number(e.target.value) })
                      }
                      className="w-16 rounded-lg bg-transparent py-2 text-center text-xl font-bold outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <button
                      type="button"
                      aria-label={ux("more_adults")}
                      disabled={
                        p.travelers.adults + p.travelers.child_ages.length >= 20
                      }
                      onClick={() =>
                        change("travelers", { adults: p.travelers.adults + 1 })
                      }
                      className="h-11 w-11 rounded-full bg-surface-container-high text-2xl font-bold text-primary disabled:opacity-40"
                    >
                      +
                    </button>
                    <span className="text-sm text-on-surface-variant">
                      {ux("adult_count", { count: p.travelers.adults })}
                    </span>
                  </div>
                </div>

                <details
                  ref={routeRef}
                  className="border-b border-outline-variant/20 pb-4"
                >
                  <summary className="cursor-pointer font-semibold">
                    {ux("route_options")}
                  </summary>
                  <div className="mt-4 space-y-4">
                    <div className="flex flex-wrap gap-4">
                      <button
                        type="button"
                        onClick={locate}
                        disabled={locating}
                        className="font-bold text-primary"
                      >
                        {locating ? (
                          <UiText id="t909cd611cece" fallback="Đang định vị…" />
                        ) : (
                          <UiText
                            id="t26af8b25ff5c"
                            fallback="Dùng vị trí hiện tại"
                          />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            setCandidates(
                              (
                                await resolveJourneyLocation({
                                  query: p.journey.origin.label,
                                })
                              ).candidates,
                            );
                          } catch (e) {
                            setError(
                              apiErrorText(e, "Không tìm được địa điểm."),
                            );
                          }
                        }}
                        className="text-sm text-primary"
                      >
                        {" "}
                        <UiText
                          id="t29d9e9b53318"
                          fallback="Tìm trong catalog"
                        />{" "}
                      </button>
                    </div>
                    {p.journey.origin.latitude !== undefined && (
                      <p className="text-sm">
                        {p.journey.origin.latitude},{" "}
                        {p.journey.origin.longitude}{" "}
                        <UiText id="t802e06869e9e" fallback="· Sai số khoảng" />{" "}
                        {Math.round(p.journey.origin.accuracy_m ?? 0)}{" "}
                        <UiText id="t6b0d31c0d563" fallback="m" />{" "}
                        <button
                          type="button"
                          className="ml-2 text-primary underline"
                          onClick={() =>
                            change("journey", {
                              origin: {
                                label:
                                  p.journey.origin.source === "browser"
                                    ? ""
                                    : p.journey.origin.label,
                                source: "manual",
                              },
                            })
                          }
                        >
                          {" "}
                          <UiText
                            id="t90dd93604483"
                            fallback="Bỏ tọa độ"
                          />{" "}
                        </button>
                      </p>
                    )}
                    <details className="text-xs text-on-surface-variant">
                      <summary className="cursor-pointer">
                        {ux("location_privacy")}
                      </summary>
                      <p className="text-xs text-on-surface-variant">
                        {" "}
                        <UiText
                          id="taff6f2ce32a5"
                          fallback="Chỉ xin định vị khi bạn bấm nút. Tọa độ gửi khi tạo/lưu nháp chủ động; nháp tự động không giữ tọa độ browser."
                        />{" "}
                      </p>
                    </details>
                    {candidates.length > 0 && (
                      <ul className="space-y-2">
                        {candidates.map((c) => (
                          <li key={c.id}>
                            <button
                              className="w-full rounded-lg border border-outline-variant/30 p-3 text-left text-sm"
                              type="button"
                              onClick={() => {
                                change("journey", {
                                  origin: {
                                    label: c.label,
                                    city_slug: c.city_slug,
                                    source: "catalog",
                                  },
                                });
                                setCandidates([]);
                              }}
                            >
                              {c.label}
                              {c.distance_km != null
                                ? ` · ${Number(c.distance_km).toFixed(1)} km đường thẳng`
                                : ""}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <label className="flex gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={p.journey.return_to_origin}
                        onChange={(e) =>
                          change("journey", {
                            return_to_origin: e.target.checked,
                          })
                        }
                      />{" "}
                      <UiText
                        id="td42551c9262b"
                        fallback="Quay về điểm xuất phát"
                      />{" "}
                    </label>
                    {!p.journey.return_to_origin &&
                      input(
                        t("Điểm kết thúc"),
                        p.journey.endpoint?.label ?? "",
                        (v) =>
                          change("journey", {
                            endpoint: { label: v, source: "manual" },
                          }),
                        "text",
                        undefined,
                        undefined,
                        true,
                      )}
                  </div>
                </details>
                <div className="mt-5 space-y-5">
                  <details
                    ref={groupRef}
                    className="border-b border-outline-variant/20 pb-5"
                  >
                    <summary className="mb-4 cursor-pointer font-bold">
                      {ux("group_preferences")}
                    </summary>
                    <div className="space-y-4">
                      {
                        <CsvField
                          label={t("Tuổi trẻ em (cách nhau bằng dấu phẩy)")}
                          values={p.travelers.child_ages}
                          onChange={(v) =>
                            change("travelers", { child_ages: v.map(Number) })
                          }
                          hint={t(
                            "Để trống nếu không có trẻ em; từ 0–17 tuổi.",
                          )}
                        />
                      }
                      {select(
                        t("Nhịp độ"),
                        p.experience_preferences.pace,
                        (v) =>
                          change("experience_preferences", {
                            pace: v as PlanningCriteria["experience_preferences"]["pace"],
                          }),
                        [
                          ["relaxed", t("Thư thả")],
                          ["balanced", t("Cân bằng")],
                          ["packed", t("Nhiều hoạt động")],
                        ],
                      )}
                      <details>
                        <summary className="cursor-pointer font-semibold text-primary">
                          {" "}
                          <UiText
                            id="tc841de1f086c"
                            fallback="Khả năng vận động & nhu cầu riêng"
                          />{" "}
                        </summary>
                        <div className="mt-4">
                          {requirements(
                            t("Yêu cầu trải nghiệm"),
                            p.experience_preferences.requirements,
                            (v) =>
                              change("experience_preferences", {
                                requirements: v,
                              }),
                          )}
                        </div>
                      </details>
                    </div>
                  </details>
                  <details
                    ref={transportRef}
                    className="border-b border-outline-variant/20 pb-5"
                  >
                    <summary className="mb-4 cursor-pointer text-lg font-bold">
                      {" "}
                      <UiText text="Transport" />{" "}
                    </summary>
                    <div className="space-y-4">
                      {select(
                        t("Phương tiện chính"),
                        p.transport_preferences.mode,
                        (v) => change("transport_preferences", { mode: v }),
                        [
                          ["suggest", "Để hệ thống đề xuất"],
                          ["flight", "Máy bay"],
                          ["train", "Tàu hỏa"],
                          ["bus", "Xe khách"],
                          ["car", "Ô tô"],
                          ["motorbike", "Xe máy"],
                          ["ferry", "Tàu/phà"],
                        ],
                      )}
                      <label className="flex gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={p.transport_preferences.confirmed}
                          onChange={(e) =>
                            change("transport_preferences", {
                              confirmed: e.target.checked,
                            })
                          }
                        />{" "}
                        <UiText
                          id="tfab997445c6a"
                          fallback="Tôi đã đặt vé"
                        />{" "}
                      </label>
                      <div className="grid gap-4 sm:grid-cols-2">
                        {input(
                          t("Giờ đến điểm du lịch"),
                          p.transport_preferences.arrival_at ?? "",
                          (v) =>
                            change("transport_preferences", {
                              arrival_at: v || undefined,
                            }),
                          "datetime-local",
                          undefined,
                          undefined,
                          p.transport_preferences.confirmed,
                        )}
                        {input(
                          t("Giờ khởi hành chặng về"),
                          p.transport_preferences.departure_at ?? "",
                          (v) =>
                            change("transport_preferences", {
                              departure_at: v || undefined,
                            }),
                          "datetime-local",
                          undefined,
                          undefined,
                          p.transport_preferences.confirmed,
                        )}
                      </div>
                      <p className="text-xs">
                        {" "}
                        <UiText
                          id="t1fc9d7076638"
                          fallback="Giờ địa phương Việt Nam. Chưa biết có thể để trống."
                        />{" "}
                      </p>
                      {needsSuggestedTravelTimes(form) && (
                        <p className="text-sm text-on-surface-variant">
                          {ux("unconfirmed_times_suggested")}
                        </p>
                      )}
                      {p.transport_preferences.confirmed && (
                        <>
                          {input(
                            t("Nhà cung cấp vé"),
                            p.transport_preferences.provider ?? "",
                            (v) =>
                              change("transport_preferences", {
                                provider: v,
                              }),
                            "text",
                            undefined,
                            undefined,
                            true,
                          )}
                          {input(
                            t("Mã đặt vé"),
                            p.transport_preferences.booking_reference ?? "",
                            (v) =>
                              change("transport_preferences", {
                                booking_reference: v,
                              }),
                          )}
                          {input(
                            t("Tổng tiền vé cả nhóm"),
                            p.transport_preferences.total_price ?? "",
                            (v) =>
                              change("transport_preferences", {
                                total_price: v ? Number(v) : undefined,
                              }),
                            "number",
                          )}
                        </>
                      )}
                    </div>
                  </details>
                  <details
                    ref={stayRef}
                    className="border-b border-outline-variant/20 pb-5"
                  >
                    <summary className="mb-4 cursor-pointer text-lg font-bold">
                      <UiText text="Accommodation" />
                    </summary>
                    <div className="space-y-4">
                      {select(
                        t("Loại chỗ ở"),
                        p.stay_preferences.type,
                        (v) => change("stay_preferences", { type: v }),
                        [
                          ["suggest", "Để hệ thống đề xuất"],
                          ["hotel", "Khách sạn"],
                          ["homestay", "Homestay"],
                          ["apartment", "Căn hộ"],
                          ["resort", "Resort"],
                          ["hostel", "Hostel"],
                          ["already_booked", "Đã đặt phòng"],
                          ["none", "Không nghỉ đêm"],
                        ],
                      )}
                      {p.stay_preferences.type !== "none" && (
                        <>
                          <div className="grid gap-4 sm:grid-cols-2">
                            {input(
                              t("Số phòng/căn"),
                              p.stay_preferences.rooms,
                              (v) =>
                                change("stay_preferences", {
                                  rooms: Number(v),
                                }),
                              "number",
                            )}
                            {input(
                              `${t("Budget/room/night")} (${p.budget.currency})`,
                              p.stay_preferences.nightly_budget ?? "",
                              (v) =>
                                change("stay_preferences", {
                                  nightly_budget: v ? Number(v) : undefined,
                                }),
                              "number",
                            )}
                          </div>
                          {p.stay_preferences.type === "already_booked" && (
                            <>
                              {input(
                                t("Tên chỗ ở đã đặt"),
                                p.stay_preferences.booked_name ?? "",
                                (v) =>
                                  change("stay_preferences", {
                                    booked_name: v,
                                  }),
                                "text",
                                undefined,
                                undefined,
                                true,
                              )}
                              {input(
                                t("Mã đặt phòng"),
                                p.stay_preferences.booking_reference ?? "",
                                (v) =>
                                  change("stay_preferences", {
                                    booking_reference: v,
                                  }),
                              )}
                              <div className="grid gap-4 sm:grid-cols-2">
                                {input(
                                  t("Ngày nhận phòng"),
                                  p.stay_preferences.check_in ?? "",
                                  (v) =>
                                    change("stay_preferences", {
                                      check_in: v || undefined,
                                    }),
                                  "date",
                                )}
                                {input(
                                  t("Ngày trả phòng"),
                                  p.stay_preferences.check_out ?? "",
                                  (v) =>
                                    change("stay_preferences", {
                                      check_out: v || undefined,
                                    }),
                                  "date",
                                )}
                              </div>
                            </>
                          )}
                        </>
                      )}
                      <details>
                        <summary className="cursor-pointer font-semibold text-primary">
                          {" "}
                          <UiText
                            id="t1efa24aa6cf8"
                            fallback="Tiêu chí phòng & thời gian dự phòng"
                          />{" "}
                        </summary>
                        <div className="mt-4 space-y-4">
                          {requirements(
                            t("Giường, khu vực, ăn sáng, đỗ xe, hủy phòng"),
                            p.stay_preferences.requirements,
                            (v) =>
                              change("stay_preferences", { requirements: v }),
                          )}
                          {input(
                            t("Dự phòng làm thủ tục sân bay (phút)"),
                            p.transport_preferences.airport_buffer_minutes,
                            (v) =>
                              change("transport_preferences", {
                                airport_buffer_minutes: Number(v),
                              }),
                            "number",
                          )}
                        </div>
                      </details>
                    </div>
                  </details>
                  <details
                    ref={diningRef}
                    className="border-b border-outline-variant/20 pb-5"
                  >
                    <summary className="mb-4 cursor-pointer text-lg font-bold">
                      {" "}
                      <UiText
                        id="t1fbe19e98e83"
                        fallback="Dining and experiences"
                      />{" "}
                    </summary>
                    <div className="space-y-4">
                      {
                        <CsvField
                          label={t("Sở thích tham quan")}
                          values={p.experience_preferences.interests}
                          onChange={(v) =>
                            change("experience_preferences", { interests: v })
                          }
                          hint={t(
                            "Ví dụ: di sản, thiên nhiên, trải nghiệm địa phương",
                          )}
                        />
                      }
                      {input(
                        `${t("Budget/meal/person")} (${p.budget.currency})`,
                        p.dining_preferences.per_person_budget ?? "",
                        (v) =>
                          change("dining_preferences", {
                            per_person_budget: v ? Number(v) : undefined,
                          }),
                        "number",
                      )}
                      {
                        <CsvField
                          label={t("Dị ứng thực phẩm — bắt buộc")}
                          values={p.dining_preferences.allergies}
                          onChange={(v) =>
                            change("dining_preferences", { allergies: v })
                          }
                          hint={t(
                            "Luôn xác nhận trực tiếp với quán về thành phần và nhiễm chéo.",
                          )}
                        />
                      }
                      {input(
                        t("Café bạn thích"),
                        p.dining_preferences.cafe,
                        (v) => change("dining_preferences", { cafe: v }),
                        "text",
                        undefined,
                        t("Để hệ thống đề xuất"),
                      )}
                      <label className="flex gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={p.dining_preferences.independent_only}
                          onChange={(e) =>
                            change("dining_preferences", {
                              independent_only: e.target.checked,
                            })
                          }
                        />{" "}
                        <UiText
                          id="t878c87e59aeb"
                          fallback="Ưu tiên quán địa phương độc lập, tránh chuỗi"
                        />{" "}
                      </label>
                      <details>
                        <summary className="cursor-pointer font-semibold text-primary">
                          {" "}
                          <UiText
                            id="t55255af0a140"
                            fallback="Khẩu vị, ăn kiêng & tiêu chí nâng cao"
                          />{" "}
                        </summary>
                        <div className="mt-4">
                          {requirements(
                            t("Yêu cầu ăn uống"),
                            p.dining_preferences.requirements,
                            (v) =>
                              change("dining_preferences", {
                                requirements: v,
                              }),
                          )}
                        </div>
                      </details>
                      {input(t("Yêu cầu thêm"), form.prompt, (v) =>
                        setForm((f) => ({ ...f, prompt: v })),
                      )}
                    </div>
                  </details>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    try {
                      const prepared = prepareCurrent();
                      explicitlySavedDraft.current = prepared.draft;
                      setForm(prepared.draft);
                      localStorage.setItem(
                        DRAFT_KEY,
                        JSON.stringify(prepared.draft),
                      );
                      setMessage(t("Đã lưu nháp, gồm vị trí bạn đang chọn."));
                    } catch {
                      setError(t("Không lưu được nháp trong trình duyệt."));
                    }
                  }}
                  className="text-sm font-semibold text-primary"
                >
                  {" "}
                  <UiText id="tac4bb1d6b418" fallback="Lưu nháp" />{" "}
                </button>
                {issues.some((issue) => issue.severity === "warning") && (
                  <details className="text-sm">
                    <summary className="cursor-pointer">
                      {ux("optional_notices")}
                    </summary>
                    <ul className="mt-2 space-y-2">
                      {issues
                        .filter((issue) => issue.severity === "warning")
                        .map((issue) => (
                          <li key={issue.code}>{issueText(issue)}</li>
                        ))}
                    </ul>
                  </details>
                )}
                <details className="text-sm">
                  <summary className="cursor-pointer font-semibold">
                    {ux("trip_summary")}
                  </summary>
                  <div className="mt-3">{summary}</div>
                </details>
              </div>
            </details>
          </fieldset>
        </form>
        <details
          open
          className="mt-5 text-sm"
          data-testid="planner-recent-requests"
        >
          <summary className="cursor-pointer text-on-surface-variant">
            {ux("recent_requests_short")}
          </summary>
          <RecentPlanningRequests />
        </details>
      </main>
    </div>
  );
}
