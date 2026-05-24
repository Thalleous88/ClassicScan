import React from 'react';
import {
  ScrollView,
  StatusBar,
  StyleProp,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Tokens } from '@/constants/theme';

type ScreenProps = {
  children: React.ReactNode;

  scroll?: boolean;

  padded?: boolean;

  insetTop?: boolean;

  insetBottom?: boolean;

  background?: string;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
};

export function Screen({
  children,
  scroll = false,
  padded = true,
  insetTop = true,
  insetBottom = true,
  background = Tokens.bg,
  contentContainerStyle,
  style,
}: ScreenProps) {
  const insets = useSafeAreaInsets();

  const padX = padded ? 20 : 0;
  const padTop = insetTop ? insets.top + 16 : 0;
  const padBottom = insetBottom ? insets.bottom + 16 : 0;

  if (scroll) {
    return (
      <View style={[{ flex: 1, backgroundColor: background }, style]}>
        <StatusBar barStyle="light-content" backgroundColor={background} />
        <ScrollView
          contentContainerStyle={[
            {
              flexGrow: 1,
              paddingHorizontal: padX,
              paddingTop: padTop,
              paddingBottom: padBottom,
            },
            contentContainerStyle,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </View>
    );
  }

  return (
    <View
      style={[
        {
          flex: 1,
          backgroundColor: background,
          paddingHorizontal: padX,
          paddingTop: padTop,
          paddingBottom: padBottom,
        },
        style,
      ]}
    >
      <StatusBar barStyle="light-content" backgroundColor={background} />
      {children}
    </View>
  );
}
