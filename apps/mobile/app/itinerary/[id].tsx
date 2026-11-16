import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState, useRef } from "react";
import type { ItineraryOutput, PlanningJob } from "@travel/types";
import { mobileApiUrl } from "../../lib/api";
import { planningErrorMessage } from "../../lib/planning-errors";
import { getAuthSession } from "../../lib/auth-provider";

const MAX_POLL_ATTEMPTS = 900;
const POLL_INTERVAL_MS = 2000;

type FetchState = "loading" | "polling" | "done" | "error";

export default function ItineraryDetailScreen() {
  const { id, source } = useLocalSearchParams<{
    id: string;
    source?: "queued" | "cached";
  }>();
  const [data, setData] = useState<ItineraryOutput | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>("loading");
  const [error, setError] = useState<string | null>(null);
  const pollCountRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const started = Date.now();

    async function attempt() {
      try {
        const session = await getAuthSession();
        const headers: Record<string, string> = session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {};
        let itineraryId = id;
        let pending = false;
        if (source === "queued") {
          const status = await fetch(
            mobileApiUrl(`/api/itinerary/jobs/${id}`),
            { headers },
          );
          if (!status.ok) throw new Error("Unable to read planning status.");
          const job = (await status.json()) as PlanningJob;
          if (job.status === "failed")
            throw new Error(planningErrorMessage(job.error_code));
          pending = job.status !== "complete";
          itineraryId = job.itinerary_id ?? id;
        }
        if (cancelled) return;
        if (pending) {
          // Still generating — poll
          pollCountRef.current += 1;
          if (
            pollCountRef.current >= MAX_POLL_ATTEMPTS ||
            Date.now() - started >= 30 * 60_000
          ) {
            setError("Still generating — check back soon.");
            setFetchState("error");
            return;
          }
          setFetchState("polling");
          pollTimerRef.current = setTimeout(
            attempt,
            Math.min(
              30_000,
              POLL_INTERVAL_MS * 2 ** Math.min(pollCountRef.current, 4),
            ),
          );
          return;
        }

        const res = await fetch(mobileApiUrl(`/api/itinerary/${itineraryId}`), {
          headers,
        });
        if (!res.ok) throw new Error(`Error ${res.status}`);

        const json = (await res.json()) as ItineraryOutput;
        if (cancelled) return;
        setData(json);
        setFetchState("done");
      } catch (e: unknown) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load itinerary.");
        setFetchState("error");
      }
    }

    attempt();

    return () => {
      cancelled = true;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [id, source]);

  if (fetchState === "loading" || fetchState === "polling") {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText} testID="mobile-itinerary-loading">
          {fetchState === "polling"
            ? "Still building your itinerary…"
            : "Loading itinerary…"}
        </Text>
      </View>
    );
  }

  if (fetchState === "error" || !data) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Failed to load. {error}</Text>
      </View>
    );
  }

  const itinerary = data.itineraries?.[0];

  if (!itinerary) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>No itinerary data available.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Overview */}
      <View style={styles.overviewCard}>
        <Text style={styles.overviewTitle} testID="mobile-itinerary-title">
          {itinerary.title}
        </Text>
        <Text style={styles.overviewSub}>
          {itinerary.num_days} days · {itinerary.num_travelers} travelers
        </Text>
        <Text style={styles.overviewText}>{itinerary.overview}</Text>
      </View>

      {/* Days */}
      {itinerary.days.map((day) => (
        <View key={day.day_number} style={styles.daySection}>
          <View style={styles.dayHeader}>
            <View style={styles.dayBadge}>
              <Text style={styles.dayBadgeText}>{day.day_number}</Text>
            </View>
            <View>
              <Text style={styles.dayCity}>{day.title}</Text>
              {day.date && <Text style={styles.dayDate}>{day.date}</Text>}
            </View>
          </View>

          {day.activities.map((act, i) => (
            <View key={`${day.day_number}-${i}`} style={styles.activityCard}>
              <View style={styles.activityHeader}>
                <Text style={styles.activityName}>{act.name}</Text>
                {act.cost != null && (
                  <Text style={styles.activityCost}>
                    ~{act.currency ?? "USD"} {act.cost.toLocaleString()}
                  </Text>
                )}
              </View>
              <Text style={styles.activityTime}>
                {act.time} · {act.duration}
              </Text>
              {act.description && (
                <Text style={styles.activityDesc}>{act.description}</Text>
              )}
              {act.golden_moment && (
                <View style={styles.goldenBadge}>
                  <Text style={styles.goldenText}>
                    ✨ {act.golden_moment.type.replace(/_/g, " ")} ·{" "}
                    {act.golden_moment.best_time}
                  </Text>
                </View>
              )}
            </View>
          ))}
        </View>
      ))}

      {/* Budget */}
      {itinerary.budget_breakdown?.total != null && (
        <View style={styles.budgetCard}>
          <Text style={styles.budgetLabel}>Estimated Total</Text>
          <Text style={styles.budgetTotal}>
            {itinerary.budget_breakdown.currency ?? "USD"}{" "}
            {itinerary.budget_breakdown.total.toLocaleString()}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const BRAND = "#6366f1";

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  content: { padding: 16, paddingBottom: 40, gap: 16 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 32,
  },
  loadingText: { fontSize: 14, color: "#6b7280" },
  errorText: { fontSize: 14, color: "#ef4444", textAlign: "center" },

  overviewCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 6,
  },
  overviewTitle: { fontSize: 22, fontWeight: "700", color: "#111827" },
  overviewSub: { fontSize: 13, color: "#6b7280" },
  overviewText: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 21,
    marginTop: 4,
  },

  daySection: { gap: 8 },
  dayHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  dayBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: BRAND,
    alignItems: "center",
    justifyContent: "center",
  },
  dayBadgeText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  dayCity: { fontSize: 17, fontWeight: "600", color: "#111827" },
  dayDate: { fontSize: 12, color: "#9ca3af" },

  activityCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginLeft: 46,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 4,
  },
  activityHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  activityName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
    paddingRight: 8,
  },
  activityCost: {
    fontSize: 13,
    fontWeight: "600",
    color: "#059669",
    flexShrink: 0,
  },
  activityTime: { fontSize: 12, color: "#9ca3af" },
  activityDesc: { fontSize: 13, color: "#374151", lineHeight: 19 },
  goldenBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#fffbeb",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  goldenText: { fontSize: 12, color: "#92400e", fontWeight: "500" },

  budgetCard: {
    backgroundColor: "#ecfdf5",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#a7f3d0",
    alignItems: "center",
    gap: 4,
  },
  budgetLabel: { fontSize: 13, color: "#065f46", fontWeight: "600" },
  budgetTotal: { fontSize: 24, fontWeight: "700", color: "#064e3b" },
});
