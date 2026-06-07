import { useEffect } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Eyebrow } from '@/components/card';
import { Tokens } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { formatBytes, refreshScans, useScanStore } from '@/lib/store';

function relativeDate(iso: string): string {
  const d = new Date(iso);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { scans, loaded, loading, error } = useScanStore();
  const recent = scans.slice(0, 3);

  useEffect(() => {
    if (!loaded) refreshScans();
  }, [loaded]);

  return (
    <View style={{ flex: 1, backgroundColor: Tokens.bg }}>
      {}
      <View
        style={{
          paddingTop: insets.top + 16,
          paddingHorizontal: 20,
          paddingBottom: 20,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
        }}
      >
        <View>
          {user ? (
            <Eyebrow>Hi, {user.username}</Eyebrow>
          ) : (
            <Eyebrow>ClassicScan</Eyebrow>
          )}
          <Text
            style={{
              color: Tokens.ink,
              fontFamily: 'PlusJakartaSans_700Bold',
              fontSize: 30,
              lineHeight: 34,
              letterSpacing: -0.5,
              marginTop: 6,
            }}
          >
            Library
          </Text>
        </View>
        <TouchableOpacity
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
          onPress={() => refreshScans()}
          accessibilityLabel="Refresh"
        >
          <Ionicons name="refresh" size={18} color={Tokens.ink} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {}
        <View style={{ paddingHorizontal: 20 }}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => router.push('/camera-scan')}
            style={{
              flexDirection: 'row',
              alignItems: 'stretch',
              backgroundColor: Tokens.surface,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: Tokens.hairline,
              overflow: 'hidden',
            }}
          >
            <View style={{ width: 4, backgroundColor: Tokens.accent }} />
            <View
              style={{
                flex: 1,
                paddingVertical: 22,
                paddingHorizontal: 20,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 16,
              }}
            >
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  backgroundColor: Tokens.accentSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="scan-outline" size={26} color={Tokens.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Eyebrow tone="accent">New scan</Eyebrow>
                <Text
                  style={{
                    color: Tokens.ink,
                    fontFamily: 'PlusJakartaSans_700Bold',
                    fontSize: 20,
                    lineHeight: 24,
                    marginTop: 4,
                  }}
                >
                  Capture a document
                </Text>
                <Text
                  style={{
                    color: Tokens.inkMuted,
                    fontFamily: 'PlusJakartaSans_400Regular',
                    fontSize: 13,
                    marginTop: 2,
                  }}
                >
                  OCR + enhancement runs on save
                </Text>
              </View>
              <Ionicons name="arrow-forward" size={20} color={Tokens.ink} />
            </View>
          </TouchableOpacity>
        </View>

        {}
        <View style={{ paddingHorizontal: 20, marginTop: 32 }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 14,
            }}
          >
            <Eyebrow>Recent</Eyebrow>
            <TouchableOpacity onPress={() => router.navigate('/(tabs)/history')}>
              <Text
                style={{
                  color: Tokens.accent,
                  fontFamily: 'PlusJakartaSans_600SemiBold',
                  fontSize: 13,
                }}
              >
                View all
              </Text>
            </TouchableOpacity>
          </View>

          {loading && !loaded ? (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <ActivityIndicator color={Tokens.accent} />
            </View>
          ) : error ? (
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
          ) : recent.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 48 }}>
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 14,
                  backgroundColor: Tokens.surface,
                  borderWidth: 1,
                  borderColor: Tokens.hairline,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 14,
                }}
              >
                <Ionicons name="document-text-outline" size={24} color={Tokens.inkMuted} />
              </View>
              <Text
                style={{
                  color: Tokens.ink,
                  fontFamily: 'PlusJakartaSans_600SemiBold',
                  fontSize: 15,
                }}
              >
                Nothing here yet
              </Text>
              <Text
                style={{
                  color: Tokens.inkMuted,
                  fontFamily: 'PlusJakartaSans_400Regular',
                  fontSize: 13,
                  marginTop: 4,
                }}
              >
                Tap the card above to capture your first scan.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {recent.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.85}
                  onPress={() => router.push({ pathname: '/ocr-result', params: { scanId: item.id } })}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: Tokens.surface,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: Tokens.hairline,
                    padding: 14,
                    gap: 14,
                  }}
                >
                  <View
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 10,
                      backgroundColor: Tokens.surfaceRaised,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons
                      name={item.has_pdf ? 'document-text-outline' : 'image-outline'}
                      size={22}
                      color={Tokens.inkMuted}
                    />
                  </View>

                  <View style={{ flex: 1, gap: 4 }}>
                    <Text
                      numberOfLines={1}
                      style={{
                        color: Tokens.ink,
                        fontFamily: 'PlusJakartaSans_600SemiBold',
                        fontSize: 14,
                      }}
                    >
                      {item.name}
                    </Text>
                    <Text
                      style={{
                        color: Tokens.inkFaint,
                        fontFamily: 'PlusJakartaSans_400Regular',
                        fontSize: 12,
                      }}
                    >
                      {relativeDate(item.created_at)} · {formatBytes(item.bytes_size)}
                      {item.has_pdf ? ' · PDF' : ''}
                    </Text>
                  </View>

                  <Ionicons name="chevron-forward" size={18} color={Tokens.inkFaint} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
