import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Eyebrow } from '@/components/card';
import { Tokens } from '@/constants/theme';
import { authSignUp } from '@/lib/api';
import { setSession } from '@/lib/auth';

type Field = 'user' | 'pw' | 'confirm';

export default function SignUpScreen() {
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<Field | null>(null);

  const onSubmit = async () => {
    if (!username.trim() || username.trim().length < 3) {
      setError('Username must be at least 3 characters.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setError(null);
    setSubmitting(true);
    const res = await authSignUp(username.trim(), password);
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    await setSession(res.data.access_token, res.data.user);
    router.replace('/(tabs)/home');
  };

  const fieldStyle = (f: Field) => ({
    backgroundColor: Tokens.surface,
    borderRadius: 10,
    paddingHorizontal: 16,
    height: 48,
    color: Tokens.ink,
    borderWidth: 1,
    borderColor: focus === f ? Tokens.accent : Tokens.hairline,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 15,
  });

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: Tokens.bg }}
    >
      <StatusBar barStyle="light-content" backgroundColor={Tokens.bg} />
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + 16,
          paddingHorizontal: 24,
          paddingBottom: insets.bottom + 32,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            width: 40,
            height: 40,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: Tokens.hairline,
            backgroundColor: Tokens.surface,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 40,
          }}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={20} color={Tokens.ink} />
        </TouchableOpacity>

        <View style={{ marginBottom: 32 }}>
          <Eyebrow tone="accent">Create account</Eyebrow>
          <Text
            style={{
              color: Tokens.ink,
              fontFamily: 'PlusJakartaSans_700Bold',
              fontSize: 32,
              lineHeight: 36,
              letterSpacing: -0.5,
              marginTop: 12,
            }}
          >
            New here
          </Text>
          <Text
            style={{
              color: Tokens.inkMuted,
              fontFamily: 'PlusJakartaSans_400Regular',
              fontSize: 15,
              lineHeight: 22,
              marginTop: 8,
            }}
          >
            Sync scans across every device you sign into.
          </Text>
        </View>

        <View style={{ gap: 16 }}>
          <View>
            <Eyebrow style={{ marginBottom: 8 }}>Username</Eyebrow>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username-new"
              value={username}
              onChangeText={setUsername}
              onFocus={() => setFocus('user')}
              onBlur={() => setFocus(null)}
              placeholder="pick a username"
              placeholderTextColor={Tokens.inkFaint}
              style={fieldStyle('user')}
            />
          </View>

          <View>
            <Eyebrow style={{ marginBottom: 8 }}>Password</Eyebrow>
            <TextInput
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password-new"
              value={password}
              onChangeText={setPassword}
              onFocus={() => setFocus('pw')}
              onBlur={() => setFocus(null)}
              placeholder="at least 8 characters"
              placeholderTextColor={Tokens.inkFaint}
              style={fieldStyle('pw')}
            />
          </View>

          <View>
            <Eyebrow style={{ marginBottom: 8 }}>Confirm password</Eyebrow>
            <TextInput
              secureTextEntry
              autoCapitalize="none"
              value={confirm}
              onChangeText={setConfirm}
              onFocus={() => setFocus('confirm')}
              onBlur={() => setFocus(null)}
              placeholder="repeat password"
              placeholderTextColor={Tokens.inkFaint}
              style={fieldStyle('confirm')}
              onSubmitEditing={onSubmit}
            />
          </View>

          {error ? (
            <View
              style={{
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderRadius: 10,
                backgroundColor: 'rgba(248,113,113,0.10)',
                borderWidth: 1,
                borderColor: 'rgba(248,113,113,0.32)',
              }}
            >
              <Text
                style={{
                  color: Tokens.danger,
                  fontFamily: 'PlusJakartaSans_500Medium',
                  fontSize: 12,
                }}
              >
                {error}
              </Text>
            </View>
          ) : null}

          <Button
            label="Create account"
            variant="primary"
            loading={submitting}
            onPress={onSubmit}
            style={{ marginTop: 8 }}
            trailing={
              !submitting ? (
                <Ionicons name="arrow-forward" size={18} color={Tokens.accentInk} />
              ) : null
            }
          />
        </View>

        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'center',
            marginTop: 32,
          }}
        >
          <Text
            style={{
              color: Tokens.inkMuted,
              fontFamily: 'PlusJakartaSans_400Regular',
              fontSize: 14,
            }}
          >
            Already have an account?{' '}
          </Text>
          <TouchableOpacity onPress={() => router.replace({ pathname: '/sign-in' })}>
            <Text
              style={{
                color: Tokens.accent,
                fontFamily: 'PlusJakartaSans_700Bold',
                fontSize: 14,
              }}
            >
              Sign in
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
