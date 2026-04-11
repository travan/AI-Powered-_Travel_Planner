import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type SavedTrip = { id: string; title: string; cities: string[]; days: number; date: string };

export default function SavedScreen() {
  const router = useRouter();
  const [trips, setTrips] = useState<SavedTrip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSaved() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data, error } = await supabase
        .from("saved_trips")
        .select("id, itinerary_id, created_at, itineraries(overview)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (!error && data) {
        const mapped: SavedTrip[] = data.map((row: Record<string, unknown>) => {
          const overview = (row.itineraries as Record<string, unknown> | null)?.overview as Record<string, unknown> | null;
          return {
            id: String(row.itinerary_id ?? row.id),
            title: String(overview?.title ?? "Untitled trip"),
            cities: (overview?.cities as string[]) ?? [],
            days: Number(overview?.total_days ?? 0),
            date: new Date(String(row.created_at)).toLocaleDateString(),
          };
        });
        setTrips(mapped);
      }
      setLoading(false);
    }
    fetchSaved();
  }, []);

  if (loading) {
    return (
      <View style={styles.empty}>
        <ActivityIndicator size="large" color={BRAND} />
      </View>
    );
  }

  if (trips.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="bookmark-outline" size={56} color="#d1d5db" />
        <Text style={styles.emptyTitle}>No saved trips yet</Text>
        <Text style={styles.emptySub}>Plan a trip and save it to see it here.</Text>
        <TouchableOpacity
          style={styles.cta}
          onPress={() => router.push("/plan")}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaText}>Plan a trip</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FlatList
      data={trips}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push(`/itinerary/${item.id}`)}
          activeOpacity={0.85}
        >
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Text style={styles.cardSub}>
            {item.cities.join(" → ")} · {item.days} days
          </Text>
          <Text style={styles.cardDate}>{item.date}</Text>
        </TouchableOpacity>
      )}
    />
  );
}

const BRAND = "#6366f1";

const styles = StyleSheet.create({
  list: { padding: 16, gap: 12 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: "600", color: "#374151" },
  emptySub: { fontSize: 14, color: "#6b7280", textAlign: "center" },
  cta: { marginTop: 8, backgroundColor: BRAND, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  ctaText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 4,
  },
  cardTitle: { fontSize: 16, fontWeight: "600", color: "#111827" },
  cardSub: { fontSize: 13, color: "#6b7280" },
  cardDate: { fontSize: 12, color: "#9ca3af" },
});
