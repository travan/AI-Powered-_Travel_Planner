import type { ComponentType } from "react";
import { Ionicons as ExpoIonicons } from "@expo/vector-icons";

// Expo's declarations may resolve a different React 19 type version.
// Keep the icon props while using the app's JSX component type.
export const Ionicons = ExpoIonicons as unknown as ComponentType<
  InstanceType<typeof ExpoIonicons>["props"]
>;
