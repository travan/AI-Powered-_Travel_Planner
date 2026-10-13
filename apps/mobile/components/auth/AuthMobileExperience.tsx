import { useState } from "react";
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
  AUTH_CONFIG_ERROR,
  isAuthConfigured,
  requestPasswordReset,
  signInWithEmail,
  signUpWithEmail,
  supportsGoogleAuth,
} from "../../lib/auth-provider";
import { signInWithGoogleOnMobile } from "../../lib/auth";
import { mobileTheme } from "../../lib/theme";
import { getPendingSearchIntent } from "../../lib/pending-search-intent";
import { normalizeSupabaseAuthError } from "@travel/types";

/** Translate normalized auth error code → human-readable English message for mobile. */
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  email_exists: "This email is already registered. Try signing in instead.",
  invalid_email: "Please enter a valid email address.",
  invalid_credentials: "Email or password is incorrect.",
  weak_password: "Password must be at least 6 characters.",
  session_expired: "Your session expired. Please sign in again.",
  rate_limited: "Too many attempts. Please wait a moment and try again.",
  oauth_error: "Could not sign in with Google. Please try again.",
  config_missing: "Auth is not configured. Please contact support.",
  unknown: "Authentication failed. Please try again.",
};

function getMobileAuthErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.startsWith("Password recovery is not available")) {
    return error.message;
  }
  if (error && typeof error === "object" && ("message" in error || "code" in error || "status" in error)) {
    const normalized = normalizeSupabaseAuthError(error as { message?: string; code?: string; status?: number });
    return AUTH_ERROR_MESSAGES[normalized.code] ?? AUTH_ERROR_MESSAGES["unknown"] ?? "Authentication failed. Please try again.";
  }
  return AUTH_ERROR_MESSAGES["unknown"] ?? "Authentication failed. Please try again.";
}

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
  const [resetFeedback, setResetFeedback] = useState<{ title: string; message: string; isError: boolean } | null>(null);

  const title = mode === "signup" ? "Start Your Narrative" : "Welcome Back";
  const subtitle = mode === "signup"
    ? "Join the circle of modern explorers."
    : "Continue your journey planning.";

  const completeAuthFlow = async () => {
    const pending = await getPendingSearchIntent();
    if (pending) {
      router.replace("/trips?resume=1");
      return;
    }

    router.replace("/(tabs)");
  };

  const onSubmit = async () => {
    if (!isAuthConfigured) {
      Alert.alert("Configuration missing", AUTH_CONFIG_ERROR);
      return;
    }

    if (!email || !password || (mode === "signup" && !fullName.trim())) {
      Alert.alert("Missing information", "Please fill in all required fields.");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "signup") {
        const signup = await signUpWithEmail({
          email,
          password,
          fullName: fullName.trim(),
        });

        if (signup.error) throw signup.error;
        if (signup.data.session) {
          await completeAuthFlow();
          return;
        }

        // Try immediate sign-in to support mock auth and environments without
        // mandatory email confirmation. If sign-in fails, keep the explicit
        // login step for providers that require confirmation.
        const signInAfterSignup = await signInWithEmail(email, password);

        if (!signInAfterSignup.error) {
          await completeAuthFlow();
          return;
        }

        Alert.alert(
          "Account created",
          "Check your email to confirm your account, then sign in.",
        );
        router.replace("/login");
      } else {
        const { error } = await signInWithEmail(email, password);

        if (error) throw error;
        await completeAuthFlow();
      }
    } catch (error) {
      Alert.alert("Auth error", getMobileAuthErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const onForgotPassword = async () => {
    setResetFeedback(null);

    if (!isAuthConfigured) {
      setResetFeedback({ title: "Configuration missing", message: AUTH_CONFIG_ERROR, isError: true });
      return;
    }

    if (!email) {
      setResetFeedback({ title: "Missing email", message: "Enter your email first.", isError: true });
      return;
    }

    setSubmitting(true);
    try {
      const webUrl = process.env.EXPO_PUBLIC_WEB_URL ?? "http://localhost:3005";
      await requestPasswordReset(email, `${webUrl}/reset-password`);
      setResetFeedback({
        title: "Reset sent",
        message: "Password reset instructions were sent to your email.",
        isError: false,
      });
    } catch (error) {
      setResetFeedback({ title: "Reset unavailable", message: getMobileAuthErrorMessage(error), isError: true });
    } finally {
      setSubmitting(false);
    }
  };

  const onGoogle = async () => {
    if (!isAuthConfigured) {
      Alert.alert("Configuration missing", AUTH_CONFIG_ERROR);
      return;
    }

    setSubmitting(true);
    try {
      await signInWithGoogleOnMobile();
      await completeAuthFlow();
    } catch (error) {
      Alert.alert("Google sign-in error", getMobileAuthErrorMessage(error));
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
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            testID="mobile-auth-email"
            onChangeText={(value) => {
              setEmail(value);
              setResetFeedback(null);
            }}
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
            <>
              <Pressable
                style={styles.forgotWrap}
                onPress={onForgotPassword}
                disabled={submitting}
                testID="mobile-auth-forgot-password"
              >
                <Text style={styles.forgot}>Forgot password?</Text>
              </Pressable>
              {resetFeedback && (
                <View
                  style={[styles.resetFeedback, resetFeedback.isError && styles.resetFeedbackError]}
                  accessibilityLiveRegion="polite"
                  testID="mobile-auth-reset-feedback"
                >
                  <Text style={styles.resetFeedbackTitle} testID="mobile-auth-reset-feedback-title">
                    {resetFeedback.title}
                  </Text>
                  <Text style={styles.resetFeedbackMessage} testID="mobile-auth-reset-feedback-message">
                    {resetFeedback.message}
                  </Text>
                </View>
              )}
            </>
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

          {supportsGoogleAuth && (
            <>
              <View style={styles.dividerRow}>
                <View style={styles.divider} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.divider} />
              </View>

              <Pressable style={styles.secondaryButton} onPress={onGoogle} disabled={submitting} testID={`mobile-auth-google-${mode}`}>
                <Text style={styles.secondaryText}>Continue with Google</Text>
              </Pressable>
            </>
          )}

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
  resetFeedback: {
    borderRadius: mobileTheme.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#e8f5ef",
    borderWidth: 1,
    borderColor: "#b7dfcb",
  },
  resetFeedbackError: {
    backgroundColor: "#fff0ed",
    borderColor: "#f1c6bc",
  },
  resetFeedbackTitle: {
    color: mobileTheme.colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  resetFeedbackMessage: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
    marginTop: 2,
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
