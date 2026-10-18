/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyl.es/), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

/** Dark neon palette. The app always uses it, whatever the phone's light/dark setting. */
export const Neon = {
  background: '#05070D',
  surface: '#0D1220',
  surfaceRaised: '#141B2E',
  border: '#1F2A44',
  text: '#E6F1FF',
  textSecondary: '#8A9BBE',
  cyan: '#00E5FF',
  green: '#39FF88',
  magenta: '#FF3DD6',
  amber: '#FFC23D',
  /** Warnings, e.g. tracker badges. */
  danger: '#FF4D6D',
  grid: 'rgba(0, 229, 255, 0.18)',
} as const;

/** Colour for a signal reading: green near, cyan medium, magenta far, grey unknown. */
export const ProximityColors = {
  near: Neon.green,
  medium: Neon.cyan,
  far: Neon.magenta,
  unknown: Neon.textSecondary,
} as const;

/** Soft glow around neon elements. iOS uses shadows; Android only supports elevation, so it gets none. */
export function glow(color: string, radius = 8) {
  return Platform.select({
    ios: { shadowColor: color, shadowOpacity: 0.8, shadowRadius: radius, shadowOffset: { width: 0, height: 0 } },
    default: {},
  });
}

const palette = {
  text: Neon.text,
  background: Neon.background,
  backgroundElement: Neon.surface,
  backgroundSelected: Neon.surfaceRaised,
  textSecondary: Neon.textSecondary,
} as const;

export const Colors = { light: palette, dark: palette } as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
