import { designTokens } from "@travel/design-tokens";

export const mobileTheme = {
  colors: {
    background: designTokens.colors.surface,
    surface: designTokens.colors.surfaceContainerLowest,
    surfaceMuted: designTokens.colors.surfaceContainerLow,
    text: designTokens.colors.onSurface,
    textMuted: designTokens.colors.onSurfaceVariant,
    primary: designTokens.colors.primary,
    primaryStrong: designTokens.colors.primaryContainer,
    onPrimary: designTokens.colors.onPrimary,
    outline: designTokens.colors.outlineVariant,
    danger: designTokens.colors.error,
  },
  radius: designTokens.radius,
} as const;
