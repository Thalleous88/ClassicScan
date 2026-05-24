import { DarkTheme, ThemeProvider, type Theme } from '@react-navigation/native';
import { Stack, router, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';

import '../global.css';
import { Tokens } from '@/constants/theme';
import { bootstrapAuth, useAuth } from '@/lib/auth';

export const unstable_settings = {
  anchor: '(tabs)',
};

const PUBLIC_ROUTES = new Set<string>(['/welcome', '/sign-in', '/sign-up']);

const GraphiteTheme: Theme = {
  ...DarkTheme,
  dark: true,
  colors: {
    ...DarkTheme.colors,
    primary: Tokens.accent,
    background: Tokens.bg,
    card: Tokens.bg,
    text: Tokens.ink,
    border: Tokens.hairline,
    notification: Tokens.accent,
  },
};

function AuthGate() {
  const { loaded, token } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    if (!loaded) return;
    const isPublic =
      PUBLIC_ROUTES.has(pathname) || pathname === '/' || pathname.startsWith('/_');
    if (!token && !isPublic) {
      router.replace('/welcome');
    }
  }, [loaded, token, pathname]);

  return null;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  useEffect(() => {
    bootstrapAuth();
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <ThemeProvider value={GraphiteTheme}>
      <AuthGate />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: Tokens.bg },
          headerStyle: { backgroundColor: Tokens.bg },
          headerTintColor: Tokens.ink,
        }}
      >
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="sign-up" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="camera-scan" options={{ headerShown: false }} />
        <Stack.Screen name="processing" options={{ headerShown: false }} />
        <Stack.Screen name="scan-preview" options={{ headerShown: false }} />
        <Stack.Screen name="ocr-result" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="light" />
    </ThemeProvider>
  );
}
