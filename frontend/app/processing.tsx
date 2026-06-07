import { useEffect, useRef, useState } from 'react';
import {
  Image,
  Text,
  View,
} from 'react-native';

import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Eyebrow } from '@/components/card';
import { Tokens } from '@/constants/theme';
import { createScan } from '@/lib/store';
import type { EnhanceMode, OcrEngine, Quad } from '@/lib/types';

export default function ProcessingScreen() {
  const insets = useSafeAreaInsets();
  const {
    imageUri,
    enhanceMode: enhanceModeParam,
    ocrEngine: ocrEngineParam,
    quad: quadParam,
  } = useLocalSearchParams<{
    imageUri: string;
    enhanceMode?: string;
    ocrEngine?: string;
    quad?: string;
  }>();
  const enhanceMode: EnhanceMode = (enhanceModeParam ?? 'color') as EnhanceMode;
  const ocrEngine: OcrEngine =
    ocrEngineParam === 'pytesseract' ? 'pytesseract' : 'from_scratch';
  const quadOverride: Quad | null = (() => {
    if (!quadParam) return null;
    try {
      const parsed = JSON.parse(quadParam);
      if (Array.isArray(parsed) && parsed.length === 4) return parsed as Quad;
    } catch {
      /* fall through */
    }
    return null;
  })();

  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const ctrlRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!imageUri) return;
    setError(null);
    setDone(false);
    setProgress(0);
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;

    let raf: number | null = null;
    let mounted = true;
    const start = Date.now();
    // From-scratch is faster, PyTesseract is slower
    const expectedMs = ocrEngine === 'from_scratch' ? 8_000 : 12_000;

    const tick = () => {
      if (!mounted) return;
      const elapsed = Date.now() - start;
      const t = Math.min(1, elapsed / expectedMs);
      const eased = 1 - Math.pow(1 - t, 2.2);
      const target = Math.min(92, Math.round(eased * 92));
      setProgress((p) => (target > p ? target : p));
      raf = requestAnimationFrame(tick) as unknown as number;
    };
    raf = requestAnimationFrame(tick) as unknown as number;

    (async () => {
      const res = await createScan(imageUri, {
        enhanceMode,
        ocrEngine,
        quadOverride,
        signal: ctrl.signal,
      });
      if (!mounted || ctrl.signal.aborted) return;
      if (raf != null) cancelAnimationFrame(raf);

      if (!res.ok) {
        setError(res.error.message);
        return;
      }

      setProgress(100);
      setDone(true);
      setTimeout(() => {
        if (!mounted || ctrl.signal.aborted) return;
        router.replace({ pathname: '/ocr-result', params: { scanId: res.data.id } });
      }, 220);
    })();

    return () => {
      mounted = false;
      if (raf != null) cancelAnimationFrame(raf);
      ctrl.abort();
    };
  }, [imageUri, enhanceMode, ocrEngine]);

  const cancel = () => {
    ctrlRef.current?.abort();
    router.back();
  };

  const retry = () => {
    setError(null);
    setProgress(0);
    router.replace({
      pathname: '/processing',
      params: {
        imageUri,
        enhanceMode,
        ocrEngine,
        ...(quadOverride ? { quad: JSON.stringify(quadOverride) } : {}),
      },
    });
  };

  const phase = error ? 'ERROR' : done ? 'COMPLETE' : 'PROCESSING';
  const title = error ? 'Extraction failed' : done ? 'Done' : 'Extracting text';

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: Tokens.bg,
        paddingTop: insets.top + 24,
        paddingBottom: insets.bottom + 24,
        paddingHorizontal: 20,
      }}
    >
      <View
        style={{
          width: '100%',
          height: 380,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: Tokens.hairline,
          backgroundColor: Tokens.surface,
          overflow: 'hidden',
        }}
      >
        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
        ) : null}
      </View>

      <View style={{ marginTop: 28, alignItems: 'flex-start' }}>
        <Eyebrow tone={error ? 'muted' : 'accent'}>{phase}</Eyebrow>
        <Text
          style={{
            color: Tokens.ink,
            fontFamily: 'PlusJakartaSans_700Bold',
            fontSize: 28,
            lineHeight: 32,
            letterSpacing: -0.4,
            marginTop: 8,
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            color: Tokens.inkMuted,
            fontFamily: 'PlusJakartaSans_400Regular',
            fontSize: 14,
            lineHeight: 22,
            marginTop: 6,
          }}
        >
          {error
            ? error
            : 'Identifying characters and converting them into searchable data.'}
        </Text>
      </View>

      {}
      <View style={{ marginTop: 24 }}>
        <View
          style={{
            height: 2,
            borderRadius: 999,
            backgroundColor: Tokens.hairline,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              height: '100%',
              backgroundColor: error ? Tokens.danger : Tokens.accent,
              width: `${progress}%`,
            }}
          />
        </View>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginTop: 10,
          }}
        >
          <Text
            style={{
              color: Tokens.inkFaint,
              fontFamily: 'PlusJakartaSans_700Bold',
              fontSize: 11,
              letterSpacing: 1.4,
            }}
          >
            {phase}
          </Text>
          <Text
            style={{
              color: error ? Tokens.danger : Tokens.accent,
              fontFamily: 'PlusJakartaSans_700Bold',
              fontSize: 12,
            }}
          >
            {progress}%
          </Text>
        </View>
      </View>

      <View style={{ flex: 1 }} />

      {error ? (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Button label="Cancel" variant="secondary" onPress={cancel} style={{ flex: 1 }} />
          <Button label="Retry" variant="primary" onPress={retry} style={{ flex: 1 }} />
        </View>
      ) : (
        <Button label="Cancel" variant="secondary" onPress={cancel} />
      )}
    </View>
  );
}
