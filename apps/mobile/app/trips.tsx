import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { GenerateResponse, Itinerary, ItineraryOutput } from "@travel/types";
import { resolveGenerateNavigationTarget } from "@travel/types";
import { mobileTheme } from "../lib/theme";
import {
  clearPendingSearchIntent,
  getPendingSearchIntentResult,
} from "../lib/pending-search-intent";
import { requireSupabase } from "../lib/supabase";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";
const MAX_POLL_ATTEMPTS = 90;
const POLL_INTERVAL_MS = 2000;

type LoadState = "idle" | "generating" | "polling" | "loading" | "ready" | "error";

export default function TripsScreen() {
  const router = useRouter();
  const { id, source, resume } = useLocalSearchParams<{
    id?: string;
    source?: "queued" | "cached";
    resume?: string;
  }>();

  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [itineraryId, setItineraryId] = useState<string | null>(null);
  const [queuedJobId, setQueuedJobId] = useState<string | null>(null);
  const pollCountRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (resume === "1") {
        setState("generating");
        const {
          data: { session },
        } = await requireSupabase().auth.getSession();

        if (!session?.access_token) {
          setError("Your session expired. Please sign in again to continue.");
          setState("error");
          router.replace("/login");
          return;
        }

        const pendingIntent = await getPendingSearchIntentResult();
        if (!pendingIntent.request) {
          setError(
            pendingIntent.status === "stale"
              ? "Your saved request expired. Please plan your trip again."
              : "No saved request found. Please start a new trip plan."
          );
          setState("error");
          return;
        }

        const response = await fetch(`${API_URL}/api/itinerary/generate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(pendingIntent.request),
        });

        if (!response.ok) {
          if (response.status === 401) {
            await clearPendingSearchIntent();
            setError("Your session expired. Please sign in again.");
            setState("error");
            router.replace("/login");
            return;
          }
          throw new Error("Unable to resume generation");
        }

        const payload = await response.json() as GenerateResponse;
        const target = resolveGenerateNavigationTarget(payload);
        if (!target) {
          throw new Error("Generation response is missing the next route target.");
        }

        await clearPendingSearchIntent();

        if (cancelled) return;

        if (target.kind === "cached") {
          setItineraryId(target.id);
          return;
        }

        setQueuedJobId(target.id);
        setState("polling");
        return;
      }

      if (source === "cached" && id) {
        setItineraryId(id);
        return;
      }

      if (source === "queued" && id) {
        setQueuedJobId(id);
        setState("polling");
        return;
      }

      setState("idle");
    }

    run().catch((e: unknown) => {
      if (cancelled) return;
      setError(e instanceof Error ? e.message : "Unable to load results.");
      setState("error");
    });

    return () => {
      cancelled = true;
    };
  }, [id, resume, router, source]);

  useEffect(() => {
    if (!queuedJobId) return;

    let cancelled = false;

    async function pollJob() {
      const res = await fetch(`${API_URL}/api/itinerary/job/${queuedJobId}`);

      if (res.status === 404 || res.status === 202) {
        pollCountRef.current += 1;
        if (pollCountRef.current >= MAX_POLL_ATTEMPTS) {
          setError("Still generating — check back soon.");
          setState("error");
          return;
        }

        setState("polling");
        pollTimerRef.current = setTimeout(() => {
          void pollJob();
        }, POLL_INTERVAL_MS);
        return;
      }

      if (!res.ok) {
        throw new Error("Failed to load queued itinerary");
      }

      const data = await res.json() as ItineraryOutput;
      if (cancelled) return;

      const first = data.itineraries?.[0];
      if (!first) {
        throw new Error("No itinerary data available.");
      }

      setItinerary(first);
      setItineraryId(first.id ?? null);
      setState("ready");
    }

    void pollJob().catch((e: unknown) => {
      if (cancelled) return;
      setError(e instanceof Error ? e.message : "Unable to fetch queued itinerary.");
      setState("error");
    });

    return () => {
      cancelled = true;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [queuedJobId]);

  useEffect(() => {
    if (!itineraryId || itinerary) return;

    let cancelled = false;
    setState("loading");

    void (async () => {
      const res = await fetch(`${API_URL}/api/itinerary/${itineraryId}`);
      if (!res.ok) throw new Error("Failed to fetch itinerary");

      const data = await res.json() as ItineraryOutput;
      if (cancelled) return;

      const first = data.itineraries?.[0];
      if (!first) throw new Error("No itinerary data available.");

      setItinerary(first);
      setState("ready");
    })().catch((e: unknown) => {
      if (cancelled) return;
      setError(e instanceof Error ? e.message : "Unable to fetch itinerary.");
      setState("error");
    });

    return () => {
      cancelled = true;
    };
  }, [itinerary, itineraryId]);

  const openDetail = () => {
    if (!itineraryId) {
      Alert.alert("Result unavailable", "Itinerary id is missing.");
      return;
    }

    router.push({
      pathname: "/itinerary/[id]",
      params: {
        id: itineraryId,
        source: "cached",
      },
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>Generated Results</Text>
      <Text style={styles.title}>Choose your itinerary</Text>
      <Text style={styles.subtitle}>Overview first, then open the full day-by-day schedule.</Text>

      {(state === "generating" || state === "polling" || state === "loading") && (
        <View style={styles.panel}>
          <ActivityIndicator size="large" color={mobileTheme.colors.primaryStrong} />
          <Text style={styles.panelTitle}>
            {state === "generating"
              ? "Resuming your saved request..."
              : state === "polling"
              ? "Generating your itinerary..."
              : "Loading your itinerary..."}
          </Text>
        </View>
      )}

      {state === "idle" && (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>No result is ready yet.</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push("/plan")}>
            <Text style={styles.primaryBtnText}>Plan a trip</Text>
          </TouchableOpacity>
        </View>
      )}

      {state === "error" && (
        <View style={styles.panel}>
          <Text style={styles.errorText}>{error ?? "Something went wrong."}</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push("/plan")}>
            <Text style={styles.primaryBtnText}>Back to planner</Text>
          </TouchableOpacity>
        </View>
      )}

      {state === "ready" && itinerary && (
        <View style={styles.card} testID="mobile-trips-overview-card">
          <Text style={styles.cardTitle}>{itinerary.title}</Text>
          <Text style={styles.cardMeta}>
            {itinerary.num_days} days · {itinerary.num_travelers} travelers
          </Text>
          <Text style={styles.cardOverview}>{itinerary.overview}</Text>

          <View style={styles.chips}>
            {itinerary.days.map((day) => (
              <View key={`${day.day_number}-${day.city}`} style={styles.chip}>
                <Text style={styles.chipText}>Day {day.day_number} · {day.city}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity style={styles.primaryBtn} onPress={openDetail} testID="mobile-trips-detail-link">
            <Text style={styles.primaryBtnText}>Open full itinerary</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: mobileTheme.colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 36,
    gap: 12,
  },
  kicker: {
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: "700",
    color: mobileTheme.colors.primary,
    fontSize: 11,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: mobileTheme.colors.text,
  },
  subtitle: {
    color: mobileTheme.colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  panel: {
    backgroundColor: mobileTheme.colors.surface,
    borderWidth: 1,
    borderColor: mobileTheme.colors.outline,
    borderRadius: 12,
    padding: 18,
    alignItems: "center",
    gap: 10,
  },
  panelTitle: {
    fontSize: 14,
    color: mobileTheme.colors.text,
    fontWeight: "600",
    textAlign: "center",
  },
  card: {
    backgroundColor: mobileTheme.colors.surface,
    borderWidth: 1,
    borderColor: mobileTheme.colors.outline,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: mobileTheme.colors.text,
  },
  cardMeta: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
  },
  cardOverview: {
    color: mobileTheme.colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: mobileTheme.colors.outline,
    backgroundColor: mobileTheme.colors.surfaceMuted,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: mobileTheme.colors.text,
  },
  primaryBtn: {
    marginTop: 6,
    backgroundColor: mobileTheme.colors.primaryStrong,
    borderRadius: mobileTheme.radius.md,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryBtnText: {
    color: mobileTheme.colors.onPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  errorText: {
    color: mobileTheme.colors.danger,
    textAlign: "center",
    fontWeight: "600",
  },
});
