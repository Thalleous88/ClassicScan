import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Badge, Eyebrow } from '@/components/card';
import { Tokens } from '@/constants/theme';
import { getPreview } from '@/lib/api';
import type { EnhanceMode } from '@/lib/types';

const MODES: { key: EnhanceMode; label: string }[] = [
  { key: 'color', label: 'Color' },
  { key: 'gray', label: 'Gray' },
  { key: 'bw', label: 'B&W' },
  { key: 'magic', label: 'Magic' },
];

export default function ScanPreviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { uri } = useLocalSearchParams<{ uri: string }>();

  const [mode, setMode] = useState<EnhanceMode>('color');
  const [previewUri, setPreviewUri] = useState<string | undefined>(undefined);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const reqIdRef = useRef(0);

  useEffect(() => {
    if (!uri) return;
    const myReqId = ++reqIdRef.current;
    setPreviewLoading(true);
    setPreviewError(null);

    (async () => {
      const res = await getPreview(uri, mode);
      if (myReqId !== reqIdRef.current) return;
      if (!res.ok) {
        setPreviewError(res.error.message);
        setPreviewUri(undefined);
        setPreviewLoading(false);
        return;
      }
      setPreviewUri(res.data.uri);
      setPreviewLoading(false);
    })();

    return () => {
      reqIdRef.current++;
    };
  }, [uri, mode]);

  const handleExtractText = () => {
    if (!uri) return;
    router.push({
      pathname: '/processing',
      params: { imageUri: uri, mode },
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: Tokens.bg, paddingTop: insets.top }}>
      <StatusBar barStyle="light-content" backgroundColor={Tokens.bg} />

      {}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingVertical: 14,
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            width: 40,
            height: 40,
            borderRadius: 999,
            backgroundColor: Tokens.surface,
            borderWidth: 1,
            borderColor: Tokens.hairline,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={20} color={Tokens.ink} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Eyebrow>Step 1 of 2</Eyebrow>
          <Text
            style={{
              color: Tokens.ink,
              fontFamily: 'PlusJakartaSans_700Bold',
              fontSize: 16,
              marginTop: 2,
            }}
          >
            Preview
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {}
      <View style={{ paddingHorizontal: 20, marginBottom: 14 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {MODES.map((m) => {
            const active = m.key === mode;
            return (
              <TouchableOpacity
                key={m.key}
                onPress={() => setMode(m.key)}
                activeOpacity={0.85}
                style={{
                  flex: 1,
                  height: 36,
                  borderRadius: 999,
                  backgroundColor: active ? Tokens.accent : Tokens.surface,
                  borderWidth: 1,
                  borderColor: active ? Tokens.accent : Tokens.hairline,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    color: active ? Tokens.accentInk : Tokens.inkMuted,
                    fontFamily: 'PlusJakartaSans_700Bold',
                    fontSize: 11,
                    letterSpacing: 0.8,
                  }}
                >
                  {m.label.toUpperCase()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: 24,
          flexGrow: 1,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            backgroundColor: Tokens.surface,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: Tokens.hairline,
            padding: 20,
            minHeight: 480,
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}
        >
          <View style={{ position: 'absolute', top: 14, right: 14, zIndex: 10 }}>
            <Badge label={previewUri ? 'Enhanced' : 'Preview'} variant="accent" />
          </View>

          {previewLoading ? (
            <View style={{ alignItems: 'center', gap: 12 }}>
              <ActivityIndicator size="large" color={Tokens.accent} />
              <Text
                style={{
                  color: Tokens.inkMuted,
                  fontFamily: 'PlusJakartaSans_500Medium',
                  fontSize: 13,
                  letterSpacing: 0.4,
                }}
              >
                Enhancing
              </Text>
            </View>
          ) : previewUri ? (
            <Image
              source={{ uri: previewUri }}
              style={{ width: '85%', height: 380, borderRadius: 6 }}
              resizeMode="contain"
            />
          ) : uri ? (
            <Image
              source={{ uri }}
              style={{ width: '85%', height: 380, borderRadius: 6 }}
              resizeMode="contain"
            />
          ) : (
            <View
              style={{
                width: '85%',
                height: 380,
                backgroundColor: Tokens.surfaceRaised,
                borderRadius: 6,
              }}
            />
          )}

          {previewError ? (
            <View
              style={{
                marginTop: 14,
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderRadius: 10,
                backgroundColor: 'rgba(251,191,36,0.10)',
                borderWidth: 1,
                borderColor: 'rgba(251,191,36,0.32)',
              }}
            >
              <Text
                style={{
                  color: Tokens.warning,
                  fontFamily: 'PlusJakartaSans_500Medium',
                  fontSize: 12,
                }}
              >
                Preview failed: {previewError}. Showing raw photo.
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {}
      <View
        style={{
          backgroundColor: Tokens.surface,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          borderTopWidth: 1,
          borderColor: Tokens.hairline,
          paddingTop: 20,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 16,
          gap: 14,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.4,
          shadowRadius: 24,
          elevation: 12,
        }}
      >
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Button
            label="Rescan"
            variant="secondary"
            onPress={() => router.back()}
            style={{ flex: 1 }}
            leading={<Ionicons name="refresh" size={18} color={Tokens.ink} />}
          />
          <Button
            label="Extract & save"
            variant="primary"
            onPress={handleExtractText}
            style={{ flex: 1.4 }}
            trailing={<Ionicons name="arrow-forward" size={18} color={Tokens.accentInk} />}
          />
        </View>
      </View>
    </View>
  );
}
