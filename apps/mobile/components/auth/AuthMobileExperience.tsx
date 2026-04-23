import { useMemo, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import {
  isSupabaseConfigured,
  requireSupabase,
  SUPABASE_CONFIG_ERROR,
} from "../../lib/supabase";
import { signInWithGoogleOnMobile } from "../../lib/auth";
import { mobileTheme } from "../../lib/theme";

type Mode = "login" | "signup";

type Props = {
  mode: Mode;
};

const HERO_IMAGE =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuCdxM22iiYu6SEv1R3mxYA0IYjf25vhtjSQe_VrlDEDWfsAaIDKtl0y8kM8rZQ1b8BW9RSomN5Twb5AwjdLfFjOO0YFkr29-MojDsCj3s9tDR-oCqsSIG_87yvLulqkbmP86RNLCdyoN-v8RobzQ1TzLPzQWGPr5iblSNMpNMJ4dSYHo8_S1h0dTHwMRQmxAM8THQ_9nH98PvzG3I-gVuy6z7U72C5rBcvLvKbpC177MKbK3uJJyAOFqOp27rUdKYhyj_R65_b5Y2E";

export function AuthMobileExperience({ mode }: Props) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const title = useMemo(
    () => (mode === "signup" ? "Start Your Narrative" : "Welcome Back"),
    [mode],
  );

  const subtitle = useMemo(
    () =>
      mode === "signup"
        ? "Join the circle of modern explorers."
        : "Continue your journey planning.",
    [mode],
  );

  const onSubmit = async () => {
    if (!isSupabaseConfigured) {
      Alert.alert("Configuration missing", SUPABASE_CONFIG_ERROR);
      return;
    }

    if (!email || !password || (mode === "signup" && !fullName.trim())) {
      Alert.alert("Missing information", "Please fill in all required fields.");
      return;
    }

    setSubmitting(true);
    try {
      const supabase = requireSupabase();
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              display_name: fullName.trim(),
            },
          },
        });

        if (error) throw error;
        Alert.alert(
          "Account created",
          "Check your email to confirm your account, then sign in.",
        );
        router.replace("/login");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;
        router.replace("/(tabs)");
      }
    } catch (error) {
      Alert.alert("Auth error", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const onForgotPassword = async () => {
    if (!isSupabaseConfigured) {
      Alert.alert("Configuration missing", SUPABASE_CONFIG_ERROR);
      return;
    }

    if (!email) {
      Alert.alert("Missing email", "Enter your email first.");
      return;
    }

    setSubmitting(true);
    try {
      const supabase = requireSupabase();
      const webUrl = process.env.EXPO_PUBLIC_WEB_URL ?? "http://localhost:3005";
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${webUrl}/reset-password`,
      });
      if (error) throw error;
      Alert.alert("Reset sent", "Password reset instructions were sent to your email.");
    } catch (error) {
      Alert.alert("Reset error", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const onGoogle = async () => {
    if (!isSupabaseConfigured) {
      Alert.alert("Configuration missing", SUPABASE_CONFIG_ERROR);
      return;
    }

    setSubmitting(true);
    try {
      await signInWithGoogleOnMobile();
      router.replace("/(tabs)");
    } catch (error) {
      Alert.alert("Google sign-in error", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <ImageBackground source={{ uri: HERO_IMAGE }} style={styles.hero}>
          <View style={styles.heroOverlay} />
          <Text style={styles.brand}>Horizon</Text>
        </ImageBackground>

        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          {mode === "signup" && (
            <>
              <Text style={styles.label}>FULL NAME</Text>
              <TextInput
                style={styles.input}
                placeholder="Elias Thorne"
                placeholderTextColor={mobileTheme.colors.textMuted}
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
                testID="mobile-auth-full-name"
              />
            </>
          )}

          <Text style={styles.label}>EMAIL ADDRESS</Text>
          <TextInput
            style={styles.input}
            placeholder="elias.thorne@horizon.com"
            placeholderTextColor={mobileTheme.colors.textMuted}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            testID="mobile-auth-email"
          />

          <Text style={styles.label}>PASSWORD</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor={mobileTheme.colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            testID="mobile-auth-password"
          />

          {mode === "login" && (
            <Pressable style={styles.forgotWrap} onPress={onForgotPassword} testID="mobile-auth-forgot-password">
              <Text style={styles.forgot}>Forgot password?</Text>
            </Pressable>
          )}

          <Pressable style={styles.primaryButton} onPress={onSubmit} disabled={submitting} testID={`mobile-auth-submit-${mode}`}>
            {submitting ? (
              <ActivityIndicator color={mobileTheme.colors.onPrimary} />
            ) : (
              <Text style={styles.primaryText}>
                {mode === "signup" ? "Create Account" : "Sign In"}
              </Text>
            )}
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.divider} />
          </View>

          <Pressable style={styles.secondaryButton} onPress={onGoogle} disabled={submitting} testID={`mobile-auth-google-${mode}`}>
            <Text style={styles.secondaryText}>Continue with Google</Text>
          </Pressable>

          <Pressable
            style={styles.toggleWrap}
            onPress={() => router.replace(mode === "signup" ? "/login" : "/signup")}
            testID={`mobile-auth-toggle-${mode}`}
          >
            <Text style={styles.toggleText}>
              {mode === "signup" ? "Already have an account? " : "No account yet? "}
              <Text style={styles.toggleLink}>{mode === "signup" ? "Log In" : "Sign Up"}</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: mobileTheme.colors.background },
  scroll: { minHeight: "100%" },
  hero: { height: 320, justifyContent: "flex-start" },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(25, 28, 29, 0.36)",
  },
  brand: {
    marginTop: 48,
    marginLeft: 24,
    color: "#f8fafc",
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  sheet: {
    marginTop: -24,
    borderTopLeftRadius: 34,
    borderTopRightRadius: 34,
    backgroundColor: "rgba(248, 249, 250, 0.97)",
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 30,
    gap: 10,
    minHeight: 620,
  },
  title: {
    color: mobileTheme.colors.text,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  subtitle: {
    color: mobileTheme.colors.textMuted,
    fontSize: 15,
    marginBottom: 10,
  },
  label: {
    color: mobileTheme.colors.primary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.1,
    marginTop: 4,
  },
  input: {
    backgroundColor: mobileTheme.colors.surfaceMuted,
    borderRadius: mobileTheme.radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: mobileTheme.colors.text,
    borderWidth: 1,
    borderColor: "#e4e9ee",
  },
  forgotWrap: {
    alignItems: "flex-end",
    marginTop: 2,
  },
  forgot: {
    color: mobileTheme.colors.primary,
    fontSize: 13,
    fontWeight: "600",
  },
  primaryButton: {
    marginTop: 8,
    borderRadius: mobileTheme.radius.pill,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: mobileTheme.colors.primaryStrong,
  },
  primaryText: {
    color: mobileTheme.colors.onPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 8,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: "#d6dde5",
  },
  dividerText: {
    color: "#7c8794",
    fontSize: 11,
    letterSpacing: 1,
    fontWeight: "700",
  },
  secondaryButton: {
    borderRadius: mobileTheme.radius.pill,
    paddingVertical: 13,
    alignItems: "center",
    backgroundColor: mobileTheme.colors.surface,
    borderWidth: 1,
    borderColor: "#dbe3eb",
  },
  secondaryText: {
    color: mobileTheme.colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  toggleWrap: {
    alignItems: "center",
    marginTop: 8,
  },
  toggleText: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
  },
  toggleLink: {
    color: mobileTheme.colors.primary,
    fontWeight: "700",
  },
});
