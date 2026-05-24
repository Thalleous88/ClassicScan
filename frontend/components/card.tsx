import React from 'react';
import { StyleProp, Text, TextStyle, View, ViewStyle } from 'react-native';

import { Tokens } from '@/constants/theme';

type CardProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;

  raised?: boolean;

  flush?: boolean;
};

export function Card({ children, style, raised = false, flush = false }: CardProps) {
  return (
    <View
      style={[
        {
          backgroundColor: raised ? Tokens.surfaceRaised : Tokens.surface,
          borderColor: Tokens.hairline,
          borderWidth: 1,
          borderRadius: 14,
          padding: flush ? 0 : 16,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

type EyebrowProps = {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  tone?: 'faint' | 'muted' | 'accent';
};

export function Eyebrow({ children, style, tone = 'faint' }: EyebrowProps) {
  const color =
    tone === 'accent' ? Tokens.accent : tone === 'muted' ? Tokens.inkMuted : Tokens.inkFaint;
  return (
    <Text
      style={[
        {
          color,
          fontFamily: 'PlusJakartaSans_700Bold',
          fontSize: 11,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
          lineHeight: 14,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

type BadgeProps = {
  label: string;
  variant?: 'accent' | 'warning' | 'neutral';
  style?: StyleProp<ViewStyle>;
};

export function Badge({ label, variant = 'neutral', style }: BadgeProps) {
  const map = {
    accent: { bg: Tokens.accentSoft, fg: Tokens.accent },
    warning: { bg: 'rgba(251,191,36,0.16)', fg: Tokens.warning },
    neutral: { bg: Tokens.surfaceRaised, fg: Tokens.inkMuted },
  } as const;
  const { bg, fg } = map[variant];

  return (
    <View
      style={[
        {
          alignSelf: 'flex-start',
          paddingVertical: 3,
          paddingHorizontal: 8,
          borderRadius: 6,
          backgroundColor: bg,
        },
        style,
      ]}
    >
      <Text
        style={{
          color: fg,
          fontSize: 10,
          letterSpacing: 1.2,
          fontFamily: 'PlusJakartaSans_700Bold',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
    </View>
  );
}

type DividerProps = { style?: StyleProp<ViewStyle> };
export function Divider({ style }: DividerProps) {
  return (
    <View
      style={[{ height: 1, backgroundColor: Tokens.hairline, alignSelf: 'stretch' }, style]}
    />
  );
}
