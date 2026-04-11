import { View, Text, StyleSheet, TouchableOpacity, Alert, Image, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";

export default function ProfileScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: "horizon://auth/callback" },
    });
    if (error) Alert.alert("Sign in error", error.message);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={BRAND} />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.container}>
        <Ionicons name="person-circle-outline" size={72} color="#d1d5db" />
        <Text style={styles.title}>Not signed in</Text>
        <Text style={styles.sub}>Sign in to save trips and sync across devices.</Text>
        <TouchableOpacity
          style={styles.btn}
          onPress={handleSignIn}
          activeOpacity={0.85}
        >
          <Text style={styles.btnText}>Sign in with Google</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const avatarUrl = user.user_metadata?.["avatar_url"] as string | undefined;
  const displayName = (user.user_metadata?.["full_name"] as string | undefined)
    ?? user.email
    ?? "Traveler";

  return (
    <View style={styles.container}>
      {avatarUrl ? (
        <Image
          source={{ uri: avatarUrl }}
          style={{ width: 72, height: 72, borderRadius: 36 }}
        />
      ) : (
        <Ionicons name="person-circle" size={72} color={BRAND} />
      )}
      <Text style={styles.title}>{displayName}</Text>
      {user.email && user.email !== displayName && (
        <Text style={styles.sub}>{user.email}</Text>
      )}
      <TouchableOpacity
        style={[styles.btn, { backgroundColor: "#ef4444" }]}
        onPress={handleSignOut}
        activeOpacity={0.85}
      >
        <Text style={styles.btnText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const BRAND = "#6366f1";

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12, backgroundColor: "#f9fafb" },
  title: { fontSize: 20, fontWeight: "700", color: "#111827" },
  sub: { fontSize: 14, color: "#6b7280", textAlign: "center" },
  btn: { marginTop: 8, backgroundColor: BRAND, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12 },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
