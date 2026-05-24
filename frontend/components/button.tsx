import React from 'react';
import {
  ActivityIndicator,
  StyleProp,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';

import { Tokens } from '@/constants/theme';

type Variant = 'primary' | 'secondary' | 'ghost';

type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;

  leading?: React.ReactNode;

  trailing?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
};

const VARIANT_BG: Record<Variant, string> = {
  primary: Tokens.accent,
  secondary: Tokens.surface,
  ghost: 'transparent',
};

const VARIANT_TEXT: Record<Variant, string> = {
  primary: Tokens.accentInk,
  secondary: Tokens.ink,
  ghost: Tokens.ink,
};

const VARIANT_BORDER: Record<Variant, string | undefined> = {
  primary: undefined,
  secondary: Tokens.hairline,
  ghost: undefined,
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  leading,
  trailing,
  style,
  textStyle,
  accessibilityLabel,
}: ButtonProps) {
  const isInert = disabled || loading;
  const borderColor = VARIANT_BORDER[variant];

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isInert}
      activeOpacity={0.85}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      style={[
        {
          height: 48,
          borderRadius: 14,
          backgroundColor: VARIANT_BG[variant],
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 20,
          opacity: isInert ? 0.5 : 1,
          borderWidth: borderColor ? 1 : 0,
          borderColor: borderColor,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? Tokens.accentInk : Tokens.ink}
        />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {leading}
          <Text
            style={[
              {
                color: VARIANT_TEXT[variant],
                fontFamily: 'PlusJakartaSans_600SemiBold',
                fontSize: 15,
                letterSpacing: 0.2,
              },
              textStyle,
            ]}
          >
            {label}
          </Text>
          {trailing}
        </View>
      )}
    </TouchableOpacity>
  );
}
