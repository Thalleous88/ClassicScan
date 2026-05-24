

import { Platform } from 'react-native';

export const Tokens = {

  bg: '#0B0B0E',
  surface: '#141418',
  surfaceRaised: '#1C1C22',
  hairline: '#26262C',

  ink: '#F4F4F5',
  inkMuted: '#A1A1AA',
  inkFaint: '#52525B',

  accent: '#6EE7B7',
  accentInk: '#0B0B0E',
  accentSoft: '#0F2E26',

  warning: '#FBBF24',
  warningInk: '#3B2A06',
  danger: '#F87171',
  dangerInk: '#3B0A0A',
} as const;

export type TokenName = keyof typeof Tokens;

export const Colors = {
  light: {
    text: Tokens.ink,
    background: Tokens.bg,
    tint: Tokens.accent,
    icon: Tokens.inkMuted,
    tabIconDefault: Tokens.inkFaint,
    tabIconSelected: Tokens.accent,
  },
  dark: {
    text: Tokens.ink,
    background: Tokens.bg,
    tint: Tokens.accent,
    icon: Tokens.inkMuted,
    tabIconDefault: Tokens.inkFaint,
    tabIconSelected: Tokens.accent,
  },
} as const;

export const Palette = {
  brand: Tokens.accent,
  brandLight: Tokens.accentSoft,
  paper: Tokens.bg,
  ink: Tokens.ink,
  inkSubtle: Tokens.inkMuted,
} as const;

export const Radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
