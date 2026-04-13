import { Stack } from "expo-router";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import { supabase } from "../lib/supabase";

export default function RootLayout() {
  useEffect(() => {
    const handleDeepLink = async (url: string | null) => {
      if (!url) return;
      if (url.includes("access_token") || url.includes("code=")) {
        await supabase.auth.exchangeCodeForSession(url);
      }
    };

    Linking.getInitialURL().then(handleDeepLink);
    const subscription = Linking.addEventListener("url", ({ url }) => {
      handleDeepLink(url);
    });

    return () => subscription.remove();
  }, []);

  return (
    <>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="signup" options={{ headerShown: false }} />
        <Stack.Screen
          name="itinerary/[id]"
          options={{ title: "Itinerary", headerBackTitle: "Back" }}
        />
        <Stack.Screen
          name="plan"
          options={{ title: "Plan a Trip", presentation: "modal" }}
        />
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}
