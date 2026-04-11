import { Stack } from "expo-router";
import { useEffect } from "react";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
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
