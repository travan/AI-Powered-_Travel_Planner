import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useState, useCallback } from "react";
import { useCitySearch } from "@travel/hooks";
import {
  TRIP_STYLES,
  buildGenerateRequest,
  createCityFromSuggestion,
  createManualCity,
  resolveGenerateNavigationTarget,
  type GenerateResponse,
  type SelectedCity,
  type TripStyleKey,
} from "@travel/types";
import { mobileTheme } from "../lib/theme";
import { requireSupabase } from "../lib/supabase";
import { savePendingSearchIntent } from "../lib/pending-search-intent";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";

export default function PlanScreen() {
  const router = useRouter();

  const [cityQuery, setCityQuery] = useState("");
  const [cities, setCities] = useState<SelectedCity[]>([]);
  const [numDays, setNumDays] = useState("5");
  const [budget, setBudget] = useState("");
  const currency = "USD";
  const [style, setStyle] = useState<TripStyleKey>("mid_range");
  const [travelers, setTravelers] = useState("2");
  const [loading, setLoading] = useState(false);

  const { suggestions, loading: searchLoading } = useCitySearch(cityQuery, API_URL);

  const addCityFromSuggestion = useCallback((slug: string, name: string) => {
    if (cities.some((c) => c.slug === slug)) return;
    setCities((prev) => [...prev, { slug, name }]);
    setCityQuery("");
  }, [cities]);

  const addCity = useCallback(() => {
    const trimmed = cityQuery.trim();
    if (!trimmed) return;
    const match = suggestions[0];
    if (match) {
      const selectedCity = createCityFromSuggestion(match);
      addCityFromSuggestion(selectedCity.slug, selectedCity.name);
    } else {
      const selectedCity = createManualCity(trimmed);
      if (cities.some((c) => c.slug === selectedCity.slug)) return;
      setCities((prev) => [...prev, selectedCity]);
      setCityQuery("");
    }
  }, [cityQuery, cities, suggestions, addCityFromSuggestion]);

  const removeCity = useCallback((slug: string) => {
    setCities((prev) => prev.filter((c) => c.slug !== slug));
  }, []);

  const handleGenerate = useCallback(async () => {
    if (cities.length === 0) {
      Alert.alert("Missing cities", "Please add at least one city.");
      return;
    }

    const requestPayload = buildGenerateRequest({
      cities,
      num_days: numDays,
      budget,
      currency,
      trip_style: style,
      num_travelers: travelers,
      locale: "en",
    });

    setLoading(true);
    try {
      const {
        data: { session },
      } = await requireSupabase().auth.getSession();

      if (!session?.access_token) {
        await savePendingSearchIntent(requestPayload);
        router.push("/login");
        return;
      }

      const res = await fetch(`${API_URL}/api/itinerary/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(requestPayload),
      });
      if (!res.ok) throw new Error("Generation failed");
      const response = await res.json() as GenerateResponse;
      const target = resolveGenerateNavigationTarget(response);

      if (!target) {
        throw new Error("Generation response is missing the next route target.");
      }

      router.replace({
        pathname: "/trips",
        params: {
          id: target.id,
          source: target.kind,
        },
      });
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to generate");
    } finally {
      setLoading(false);
    }
  }, [cities, numDays, budget, currency, style, travelers, router]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" testID="mobile-plan-screen">
      {/* Cities */}
      <Text style={styles.label}>Cities</Text>
      <View style={styles.row}>
        <TextInput
          testID="mobile-plan-city-input"
          style={[styles.input, { flex: 1 }]}
          placeholder="Search a city…"
          placeholderTextColor="#9ca3af"
          value={cityQuery}
          onChangeText={setCityQuery}
          onSubmitEditing={addCity}
          returnKeyType="done"
        />
        <TouchableOpacity testID="mobile-plan-add-city" style={styles.addBtn} onPress={addCity}>
          <Text style={styles.addBtnText}>+</Text>
        </TouchableOpacity>
      </View>
      {/* Autocomplete suggestions */}
      {cityQuery.length >= 2 && (
        <View style={styles.suggestionList}>
          {searchLoading && (
            <View style={styles.suggestionItem}>
              <Text style={styles.suggestionSubText}>Searching…</Text>
            </View>
          )}
          {!searchLoading && suggestions.length === 0 && (
            <View style={styles.suggestionItem}>
              <Text style={styles.suggestionSubText}>No results – press + to add anyway</Text>
            </View>
          )}
          {suggestions.map((s) => (
            <TouchableOpacity
              key={s.slug}
              style={styles.suggestionItem}
              onPress={() => addCityFromSuggestion(s.slug, s.name["en"] ?? s.slug)}
            >
              <Text style={styles.suggestionText}>{s.name["en"] ?? s.slug}</Text>
              <Text style={styles.suggestionSubText}>{s.country}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {cities.length > 0 && (
        <View style={styles.chips}>
          {cities.map((c, i) => (
            <View key={c.slug} style={styles.chip}>
              <Text style={styles.chipText}>#{i + 1} {c.name}</Text>
              <TouchableOpacity onPress={() => removeCity(c.slug)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.chipRemove}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Days */}
      <Text style={[styles.label, { marginTop: 16 }]}>Number of days</Text>
      <TextInput
        style={styles.input}
        keyboardType="number-pad"
        value={numDays}
        onChangeText={setNumDays}
        placeholder="5"
        placeholderTextColor="#9ca3af"
      />

      {/* Budget */}
      <Text style={[styles.label, { marginTop: 16 }]}>Budget (optional)</Text>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          keyboardType="decimal-pad"
          value={budget}
          onChangeText={setBudget}
          placeholder="e.g. 500"
          placeholderTextColor="#9ca3af"
        />
        <View style={styles.currencyBadge}>
          <Text style={styles.currencyText}>{currency}</Text>
        </View>
      </View>

      {/* Style */}
      <Text style={[styles.label, { marginTop: 16 }]}>Trip style</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.row}>
          {TRIP_STYLES.map((s) => (
            <TouchableOpacity
              key={s.key}
              onPress={() => setStyle(s.key)}
              style={[styles.styleChip, style === s.key && styles.styleChipActive]}
            >
              <Text style={[styles.styleText, style === s.key && styles.styleTextActive]}>
                {s.emoji} {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Travelers */}
      <Text style={[styles.label, { marginTop: 16 }]}>Travelers</Text>
      <TextInput
        style={styles.input}
        keyboardType="number-pad"
        value={travelers}
        onChangeText={setTravelers}
        placeholder="1"
        placeholderTextColor="#9ca3af"
      />

      {/* Submit */}
      <TouchableOpacity
        testID="mobile-plan-generate"
        style={[styles.generateBtn, loading && { opacity: 0.6 }]}
        onPress={handleGenerate}
        disabled={loading}
        activeOpacity={0.85}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.generateText}>Generate itinerary →</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mobileTheme.colors.background },
  content: { padding: 16, paddingBottom: 60, gap: 6 },
  label: { fontSize: 12, fontWeight: "600", color: mobileTheme.colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  input: {
    backgroundColor: mobileTheme.colors.surface,
    borderWidth: 1,
    borderColor: mobileTheme.colors.outline,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: mobileTheme.colors.text,
  },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  addBtn: {
    width: 44,
    height: 44,
    backgroundColor: mobileTheme.colors.primaryStrong,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnText: { color: "#fff", fontSize: 22, fontWeight: "700", lineHeight: 26 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#d9ecff",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
    borderWidth: 1,
    borderColor: mobileTheme.colors.primary,
  },
  chipText: { fontSize: 13, color: mobileTheme.colors.primary, fontWeight: "500" },
  chipRemove: { fontSize: 16, color: mobileTheme.colors.primary, lineHeight: 18 },
  currencyBadge: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: mobileTheme.colors.surfaceMuted,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: mobileTheme.colors.outline,
  },
  currencyText: { fontSize: 14, fontWeight: "600", color: mobileTheme.colors.textMuted },
  styleChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: mobileTheme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: mobileTheme.colors.outline,
    marginRight: 8,
  },
  styleChipActive: { backgroundColor: "#d9ecff", borderColor: mobileTheme.colors.primary },
  styleText: { fontSize: 13, color: mobileTheme.colors.textMuted, textTransform: "capitalize" },
  styleTextActive: { color: mobileTheme.colors.primary, fontWeight: "600" },
  generateBtn: {
    marginTop: 24,
    backgroundColor: mobileTheme.colors.primaryStrong,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  generateText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  suggestionList: {
    backgroundColor: mobileTheme.colors.surface,
    borderWidth: 1,
    borderColor: mobileTheme.colors.outline,
    borderRadius: 10,
    marginTop: 4,
    overflow: "hidden",
  },
  suggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: mobileTheme.colors.surfaceMuted,
    gap: 2,
  },
  suggestionText: { fontSize: 14, fontWeight: "600", color: mobileTheme.colors.text },
  suggestionSubText: { fontSize: 12, color: mobileTheme.colors.textMuted },
});
