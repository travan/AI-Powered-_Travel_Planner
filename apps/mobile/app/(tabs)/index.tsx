import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import { useState } from "react";

const TRIP_STYLES = [
  { key: "budget", label: "Budget", emoji: "💰" },
  { key: "mid_range", label: "Mid-range", emoji: "🏨" },
  { key: "luxury", label: "Luxury", emoji: "✨" },
  { key: "adventure", label: "Adventure", emoji: "🧗" },
  { key: "family", label: "Family", emoji: "👨‍👩‍👧" },
  { key: "romantic", label: "Romantic", emoji: "💑" },
  { key: "cultural", label: "Cultural", emoji: "🏛️" },
];

export default function HomeScreen() {
  const router = useRouter();
  const [cityQuery, setCityQuery] = useState("");
  const [selectedStyle, setSelectedStyle] = useState("mid_range");

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Hero */}
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Where to next? ✈️</Text>
        <Text style={styles.heroSub}>
          AI-powered itineraries tailored to your style and budget.
        </Text>
      </View>

      {/* Quick plan card */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Destination</Text>
        <TextInput
          style={styles.input}
          placeholder="Search city…"
          placeholderTextColor="#9ca3af"
          value={cityQuery}
          onChangeText={setCityQuery}
          returnKeyType="search"
        />

        <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Trip style</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.styleScroll}>
          {TRIP_STYLES.map((s) => (
            <TouchableOpacity
              key={s.key}
              onPress={() => setSelectedStyle(s.key)}
              style={[
                styles.styleChip,
                selectedStyle === s.key && styles.styleChipActive,
              ]}
            >
              <Text style={styles.styleEmoji}>{s.emoji}</Text>
              <Text
                style={[
                  styles.styleLabel,
                  selectedStyle === s.key && styles.styleLabelActive,
                ]}
              >
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <TouchableOpacity
          style={styles.planButton}
          onPress={() => router.push("/plan")}
          activeOpacity={0.85}
        >
          <Text style={styles.planButtonText}>Plan my trip →</Text>
        </TouchableOpacity>
      </View>

      {/* Features grid */}
      <View style={styles.grid}>
        {FEATURES.map((f) => (
          <View key={f.title} style={styles.featureCard}>
            <Text style={styles.featureEmoji}>{f.emoji}</Text>
            <Text style={styles.featureTitle}>{f.title}</Text>
            <Text style={styles.featureDesc}>{f.desc}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const FEATURES = [
  { emoji: "🗓️", title: "Day-by-day plan", desc: "Structured activities for every day" },
  { emoji: "💳", title: "Budget tracker", desc: "Never overspend with real-time breakdowns" },
  { emoji: "🚆", title: "Transport", desc: "Trains, buses, flights compared" },
  { emoji: "🌅", title: "Golden moments", desc: "Sunrise & sunset hints in your schedule" },
];

const BRAND = "#6366f1";

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  content: { padding: 16, paddingBottom: 40, gap: 16 },
  hero: { paddingVertical: 24 },
  heroTitle: { fontSize: 28, fontWeight: "700", color: "#111827", marginBottom: 6 },
  heroSub: { fontSize: 15, color: "#6b7280", lineHeight: 22 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  sectionLabel: { fontSize: 12, fontWeight: "600", color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#111827",
    backgroundColor: "#f9fafb",
  },
  styleScroll: { marginHorizontal: -4 },
  styleChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f3f4f6",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  styleChipActive: { backgroundColor: `${BRAND}18`, borderColor: BRAND },
  styleEmoji: { fontSize: 14 },
  styleLabel: { fontSize: 13, color: "#374151" },
  styleLabelActive: { color: BRAND, fontWeight: "600" },
  planButton: {
    marginTop: 20,
    backgroundColor: BRAND,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  planButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  featureCard: {
    width: "47.5%",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 4,
  },
  featureEmoji: { fontSize: 24 },
  featureTitle: { fontSize: 14, fontWeight: "600", color: "#111827" },
  featureDesc: { fontSize: 12, color: "#6b7280", lineHeight: 18 },
});
