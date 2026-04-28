import { View, Text, StyleSheet, TouchableOpacity, Alert, Image, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import type { AuthenticatedSessionUser } from "@travel/types";
import {
  isSupabaseConfigured,
  requireSupabase,
  SUPABASE_CONFIG_ERROR,
} from "../../lib/supabase";
import { signInWithGoogleOnMobile } from "../../lib/auth";
import { mobileTheme } from "../../lib/theme";

export default function ProfileScreen() {
  const router = useRouter();
  const [user, setUser] = useState<AuthenticatedSessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    const supabase = requireSupabase();
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
    try {
      await signInWithGoogleOnMobile();
    } catch (error) {
      Alert.alert("Sign in error", error instanceof Error ? error.message : "Please try again");
    }
  };

  const handleSignOut = async () => {
    await requireSupabase().auth.signOut();
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={mobileTheme.colors.primaryStrong} />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.container}>
        <Ionicons name="person-circle-outline" size={72} color="#c9d3de" />
        <Text style={styles.title} testID="mobile-profile-state">
          {isSupabaseConfigured ? "Not signed in" : "Auth unavailable"}
        </Text>
        <Text style={styles.sub}>
          {isSupabaseConfigured
            ? "Sign in to save trips and sync across devices."
            : SUPABASE_CONFIG_ERROR}
        </Text>
        <TouchableOpacity
          style={[styles.btn, styles.primaryBtn]}
          onPress={() => router.push("/login")}
          disabled={!isSupabaseConfigured}
          activeOpacity={0.85}
        >
          <Text style={styles.btnText}>Sign in with email</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.secondaryBtn]}
          onPress={() => router.push("/signup")}
          disabled={!isSupabaseConfigured}
          activeOpacity={0.85}
        >
          <Text style={styles.secondaryBtnText}>Create account</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.secondaryBtn]}
          onPress={handleSignIn}
          disabled={!isSupabaseConfigured}
          activeOpacity={0.85}
        >
          <Text style={styles.secondaryBtnText}>Continue with Google</Text>
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
        <Ionicons name="person-circle" size={72} color={mobileTheme.colors.primaryStrong} />
      )}
      <Text style={styles.title} testID="mobile-profile-name">{displayName}</Text>
      {user.email && user.email !== displayName && (
        <Text style={styles.sub} testID="mobile-profile-email">{user.email}</Text>
      )}
      <TouchableOpacity
        style={[styles.btn, { backgroundColor: mobileTheme.colors.danger }]}
        onPress={handleSignOut}
        activeOpacity={0.85}
        testID="mobile-profile-signout"
      >
        <Text style={styles.btnText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
    backgroundColor: mobileTheme.colors.background,
  },
  title: { fontSize: 20, fontWeight: "700", color: mobileTheme.colors.text },
  sub: { fontSize: 14, color: mobileTheme.colors.textMuted, textAlign: "center" },
  btn: { marginTop: 8, paddingHorizontal: 28, paddingVertical: 14, borderRadius: mobileTheme.radius.md },
  primaryBtn: { backgroundColor: mobileTheme.colors.primaryStrong },
  secondaryBtn: {
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.outline,
    borderWidth: 1,
  },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  secondaryBtnText: { color: mobileTheme.colors.text, fontSize: 15, fontWeight: "600" },
});
