import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Eyebrow } from '@/components/card';
import { Tokens } from '@/constants/theme';
import { signOut } from '@/lib/auth';
import { formatBytes, refreshScans, removeScan, useScanStore } from '@/lib/store';

function relativeDate(iso: string): string {
  const d = new Date(iso);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [searchFocus, setSearchFocus] = useState(false);
  const { scans, loading, loaded, error } = useScanStore();

  useEffect(() => {
    if (!loaded) refreshScans();
  }, [loaded]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scans;
    return scans.filter((s) => s.name.toLowerCase().includes(q));
  }, [scans, search]);

  const onLongPress = (id: string, name: string) => {
    Alert.alert(
      'Delete scan?',
      name,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const r = await removeScan(id);
            if (!r.ok) Alert.alert('Delete failed', r.error.message);
          },
        },
      ],
    );
  };

  const onSignOut = () => {
    Alert.alert('Sign out?', 'You can sign in again anytime.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/welcome');
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: Tokens.bg }}>
      {}
      <View
        style={{
          paddingTop: insets.top + 16,
          paddingHorizontal: 20,
          paddingBottom: 16,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
        }}
      >
        <View>
          <Eyebrow>Library</Eyebrow>
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
            Every scan
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
          onPress={onSignOut}
          accessibilityLabel="Sign out"
        >
          <Ionicons name="log-out-outline" size={18} color={Tokens.ink} />
        </TouchableOpacity>
      </View>

      {}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: Tokens.surface,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: searchFocus ? Tokens.accent : Tokens.hairline,
          marginHorizontal: 20,
          marginBottom: 16,
          paddingHorizontal: 14,
          height: 44,
          gap: 10,
        }}
      >
        <Ionicons name="search" size={16} color={Tokens.inkFaint} />
        <TextInput
          placeholder="Search scans"
          value={search}
          onChangeText={setSearch}
          onFocus={() => setSearchFocus(true)}
          onBlur={() => setSearchFocus(false)}
          placeholderTextColor={Tokens.inkFaint}
          style={{
            flex: 1,
            color: Tokens.ink,
            fontFamily: 'PlusJakartaSans_400Regular',
            fontSize: 14,
          }}
        />
      </View>

      {error ? (
        <View
          style={{
            marginHorizontal: 20,
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderRadius: 10,
            backgroundColor: 'rgba(248,113,113,0.10)',
            borderWidth: 1,
            borderColor: 'rgba(248,113,113,0.32)',
            marginBottom: 12,
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

      {!loaded && loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 }}>
          <ActivityIndicator color={Tokens.accent} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 }}>
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
              marginBottom: 16,
            }}
          >
            <Ionicons name="document-text-outline" size={24} color={Tokens.inkMuted} />
          </View>
          <Text
            style={{
              color: Tokens.ink,
              fontFamily: 'PlusJakartaSans_600SemiBold',
              fontSize: 15,
              marginBottom: 4,
            }}
          >
            {scans.length === 0 ? 'No scans yet' : 'No matches'}
          </Text>
          <Text
            style={{
              color: Tokens.inkMuted,
              fontFamily: 'PlusJakartaSans_400Regular',
              fontSize: 13,
              textAlign: 'center',
              paddingHorizontal: 40,
            }}
          >
            {scans.length === 0
              ? 'Capture a document with the New scan button to populate your library.'
              : 'Try a different search term.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 140 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => refreshScans()}
              tintColor={Tokens.accent}
              colors={[Tokens.accent]}
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push({ pathname: '/ocr-result', params: { scanId: item.id } })}
              onLongPress={() => onLongPress(item.id, item.name)}
              style={{
                flexDirection: 'row',
                backgroundColor: Tokens.surface,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: Tokens.hairline,
                padding: 14,
                gap: 14,
                alignItems: 'center',
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
            </TouchableOpacity>
          )}
        />
      )}

      {}
      <TouchableOpacity
        onPress={() => router.push('/camera-scan')}
        activeOpacity={0.9}
        style={{
          position: 'absolute',
          right: 20,
          bottom: insets.bottom + 84,
          height: 52,
          paddingHorizontal: 22,
          borderRadius: 999,
          backgroundColor: Tokens.accent,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
        accessibilityLabel="New scan"
      >
        <Ionicons name="add" size={22} color={Tokens.accentInk} />
        <Text
          style={{
            color: Tokens.accentInk,
            fontFamily: 'PlusJakartaSans_700Bold',
            fontSize: 13,
            letterSpacing: 0.6,
          }}
        >
          NEW SCAN
        </Text>
      </TouchableOpacity>
    </View>
  );
}
