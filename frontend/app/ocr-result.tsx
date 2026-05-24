import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';

import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Eyebrow } from '@/components/card';
import { Tokens } from '@/constants/theme';
import { downloadAsset } from '@/lib/api';
import {
  attachPdf,
  fetchAssetToCache,
  getCachedScan,
  loadScan,
  reprocessScan,
  useScanStore,
} from '@/lib/store';
import type { PipelinePath, ScanRecord } from '@/lib/types';

export default function OCRResultScreen() {
  const insets = useSafeAreaInsets();
  const { scanId } = useLocalSearchParams<{ scanId?: string }>();
  const store = useScanStore();
  const scan: ScanRecord | undefined = scanId ? store.details[scanId] : undefined;

  const [loading, setLoading] = useState(false);
  const [savingPdf, setSavingPdf] = useState(false);
  const [savingText, setSavingText] = useState(false);
  const [reprocessing, setReprocessing] = useState<PipelinePath | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);

  useEffect(() => {
    if (!scanId) return;
    if (!getCachedScan(scanId)) {
      setLoading(true);
      loadScan(scanId).then((res) => {
        if (!res.ok) setError(res.error.message);
        setLoading(false);
      });
    }
  }, [scanId]);

  useEffect(() => {
    if (!scan) return;
    const kind: 'enhanced' | 'raw' | null = scan.assets.enhanced
      ? 'enhanced'
      : scan.assets.raw
      ? 'raw'
      : null;
    if (!kind) {
      setImageUri(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const r = await fetchAssetToCache(scan.id, kind);
      if (cancelled) return;
      if (r.ok) setImageUri(r.data.uri);
    })();
    return () => {
      cancelled = true;
    };
  }, [scan?.id, scan?.assets.enhanced, scan?.assets.raw]);

  const ocrText = scan?.text?.trim() || '';
  const warning = scan?.confidence_warning ?? null;

  const handleSavePdf = async () => {
    if (!scan || savingPdf) return;
    setError(null);

    if (scan.assets.pdf) {
      setSavingPdf(true);
      const r = await downloadAsset(scan.id, 'pdf', `${scan.name}.pdf`);
      setSavingPdf(false);
      if (!r.ok) {
        setError(r.error.message);
        return;
      }
      if (await Sharing.isAvailableAsync()) {
        try {
          await Sharing.shareAsync(r.data.uri, {
            mimeType: 'application/pdf',
            dialogTitle: 'Save scan',
            UTI: 'com.adobe.pdf',
          });
        } catch {

        }
      }
      return;
    }

    setSavingPdf(true);
    const res = await attachPdf(scan.id, {
      enhanceMode: scan.enhance_mode,
      searchable: scan.pipeline_path === 'printed' && scan.mean_conf >= 60,
    });
    if (!res.ok) {
      setError(res.error.message);
      setSavingPdf(false);
      return;
    }
    const dl = await downloadAsset(scan.id, 'pdf', `${scan.name}.pdf`);
    setSavingPdf(false);
    if (!dl.ok) {
      setError(dl.error.message);
      return;
    }
    if (await Sharing.isAvailableAsync()) {
      try {
        await Sharing.shareAsync(dl.data.uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Save scan',
          UTI: 'com.adobe.pdf',
        });
      } catch {

      }
    }
  };

  const handleShareText = async () => {
    if (!scan || savingText) return;
    setSavingText(true);
    setError(null);
    try {
      const dir = new Directory(Paths.cache, 'shared-text');
      if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
      const f = new File(dir, `${scan.name}.txt`);
      if (f.exists) f.delete();
      f.create();
      f.write(ocrText);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(f.uri, {
          mimeType: 'text/plain',
          dialogTitle: 'Share extracted text',
        });
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to share text');
    } finally {
      setSavingText(false);
    }
  };

  const handleCopyText = async () => {
    if (!ocrText) return;
    try {
      await Clipboard.setStringAsync(ocrText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to copy text');
    }
  };

  const handleReprocess = async (target: PipelinePath) => {
    if (!scan || reprocessing) return;
    if (target === scan.pipeline_path) return;
    setError(null);
    setReprocessing(target);
    const res = await reprocessScan(scan.id, target, {
      enhanceMode: scan.enhance_mode,
    });
    setReprocessing(null);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }

    const kind: 'enhanced' | 'raw' | null = res.data.assets.enhanced
      ? 'enhanced'
      : res.data.assets.raw
      ? 'raw'
      : null;
    if (kind) {
      const r = await fetchAssetToCache(res.data.id, kind);
      if (r.ok) setImageUri(r.data.uri);
    }
  };

  if (!scan && loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: Tokens.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={Tokens.accent} size="large" />
      </View>
    );
  }

  if (!scan) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: Tokens.bg,
          paddingTop: insets.top + 24,
          paddingHorizontal: 24,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
        }}
      >
        <Text
          style={{
            color: Tokens.ink,
            fontFamily: 'PlusJakartaSans_600SemiBold',
            fontSize: 16,
          }}
        >
          Scan not found.
        </Text>
        {error ? (
          <Text
            style={{
              color: Tokens.danger,
              fontFamily: 'PlusJakartaSans_500Medium',
              fontSize: 12,
            }}
          >
            {error}
          </Text>
        ) : null}
        <Button
          label="Back to library"
          variant="primary"
          onPress={() => router.replace('/(tabs)/history')}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Tokens.bg }}>
      {}
      <View
        style={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 20,
          paddingBottom: 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <TouchableOpacity
          onPress={() => router.replace('/(tabs)/history')}
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
        >
          <Ionicons name="chevron-back" size={20} color={Tokens.ink} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 12 }}>
          <Eyebrow>Scan</Eyebrow>
          <Text
            numberOfLines={1}
            style={{
              color: Tokens.ink,
              fontFamily: 'PlusJakartaSans_700Bold',
              fontSize: 16,
              marginTop: 2,
              maxWidth: 220,
            }}
          >
            {scan.name}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 24,
        }}
      >
        {warning ? (
          <View
            style={{
              marginBottom: 14,
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
              {warning}
            </Text>
          </View>
        ) : null}

        {imageUri ? (
          <View
            style={{
              borderRadius: 14,
              borderWidth: 1,
              borderColor: Tokens.hairline,
              overflow: 'hidden',
              marginBottom: 16,
            }}
          >
            <Image
              source={{ uri: imageUri }}
              style={{ width: '100%', height: 200 }}
              resizeMode="cover"
            />
          </View>
        ) : null}

        {}
        <View
          style={{
            flexDirection: 'row',
            gap: 12,
            marginBottom: 14,
          }}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: Tokens.surface,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: Tokens.hairline,
              paddingVertical: 12,
              paddingHorizontal: 14,
            }}
          >
            <Eyebrow>Pipeline</Eyebrow>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
              {(['printed', 'handwriting'] as PipelinePath[]).map((p) => {
                const active = scan.pipeline_path === p;
                const busy = reprocessing === p;
                return (
                  <TouchableOpacity
                    key={p}
                    onPress={() => handleReprocess(p)}
                    disabled={active || !!reprocessing}
                    activeOpacity={0.85}
                    style={{
                      flex: 1,
                      height: 28,
                      borderRadius: 999,
                      backgroundColor: active ? Tokens.accent : 'transparent',
                      borderWidth: 1,
                      borderColor: active ? Tokens.accent : Tokens.hairline,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: !active && reprocessing && !busy ? 0.4 : 1,
                    }}
                  >
                    {busy ? (
                      <ActivityIndicator size="small" color={Tokens.ink} />
                    ) : (
                      <Text
                        style={{
                          color: active ? Tokens.accentInk : Tokens.inkMuted,
                          fontFamily: 'PlusJakartaSans_700Bold',
                          fontSize: 10,
                          letterSpacing: 0.8,
                          textTransform: 'uppercase',
                        }}
                      >
                        {p === 'printed' ? 'Printed' : 'Hand'}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          {scan.mean_conf > 0 ? (
            <View
              style={{
                flex: 1,
                backgroundColor: Tokens.surface,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: Tokens.hairline,
                paddingVertical: 12,
                paddingHorizontal: 14,
              }}
            >
              <Eyebrow>Confidence</Eyebrow>
              <Text
                style={{
                  color: Tokens.ink,
                  fontFamily: 'PlusJakartaSans_700Bold',
                  fontSize: 14,
                  marginTop: 4,
                }}
              >
                {scan.mean_conf.toFixed(0)}%
              </Text>
            </View>
          ) : null}
        </View>

        {}
        <View
          style={{
            backgroundColor: Tokens.surface,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: Tokens.hairline,
            padding: 18,
            minHeight: 200,
          }}
        >
          <Eyebrow style={{ marginBottom: 14 }}>Extracted text</Eyebrow>
          <Text
            style={{
              color: Tokens.ink,
              fontFamily: 'PlusJakartaSans_400Regular',
              fontSize: 15,
              lineHeight: 24,
            }}
            selectable
          >
            {ocrText || 'No text extracted.'}
          </Text>
        </View>

        {error ? (
          <View
            style={{
              marginTop: 12,
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

        {}
        <View style={{ marginTop: 20, gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Button
              label={copied ? 'Copied' : 'Copy'}
              variant="secondary"
              onPress={handleCopyText}
              disabled={!ocrText}
              style={{ flex: 1 }}
              leading={
                <Ionicons
                  name={copied ? 'checkmark' : 'copy-outline'}
                  size={18}
                  color={copied ? Tokens.accent : Tokens.ink}
                />
              }
            />
            <Button
              label="Share"
              variant="secondary"
              loading={savingText}
              onPress={handleShareText}
              style={{ flex: 1 }}
              leading={<Ionicons name="share-outline" size={18} color={Tokens.ink} />}
            />
          </View>

          <Button
            label={scan.assets.pdf ? 'Open PDF' : 'Save as PDF'}
            variant="primary"
            loading={savingPdf}
            onPress={handleSavePdf}
            leading={
              !savingPdf ? (
                <Ionicons
                  name={scan.assets.pdf ? 'open-outline' : 'download-outline'}
                  size={18}
                  color={Tokens.accentInk}
                />
              ) : null
            }
          />
        </View>
      </ScrollView>
    </View>
  );
}
