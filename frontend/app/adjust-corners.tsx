import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  GestureHandlerRootView,
  PanGestureHandler,
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
  State,
} from 'react-native-gesture-handler';
import Svg, { Polygon as SvgPolygon } from 'react-native-svg';

import { Button } from '@/components/button';
import { Eyebrow } from '@/components/card';
import { Tokens } from '@/constants/theme';
import { detectQuad } from '@/lib/api';
import type { Quad } from '@/lib/types';

const CANVAS_PADDING = 16;
const HANDLE_SIZE = 28;

type Pt = [number, number];

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export default function AdjustCornersScreen() {
  const insets = useSafeAreaInsets();
  const { uri } = useLocalSearchParams<{ uri: string }>();

  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);
  const [canvasFrame, setCanvasFrame] = useState<{ w: number; h: number } | null>(
    null,
  );
  const [detecting, setDetecting] = useState(true);
  const [detectError, setDetectError] = useState<string | null>(null);
  // points are stored in CONTAINER-LOCAL coordinates (the flex region the user sees)
  const [points, setPoints] = useState<Pt[]>([]);
  // base used while dragging — captured on PanGestureHandler BEGAN
  const dragBaseRef = useRef<Pt[] | null>(null);
  // initial detection results, consumed once when the canvas is known
  const initialQuadRef = useRef<Quad | null>(null);
  const initialImageSizeRef = useRef<{ w: number; h: number } | null>(null);

  // 1) Get image natural size + run a server-side detection to seed corners.
  //
  // The server is the source of truth for image dimensions: it decodes the
  // JPEG with EXIF orientation honoured, so its (image_width, image_height)
  // matches the pixel grid that quad_override will land in at extract time.
  // `Image.getSize` is kept only as a fallback so the screen still renders
  // the captured photo if `/scan/detect` is unreachable (offline, server
  // down, etc.) — without it the user couldn't manually crop.
  useEffect(() => {
    if (!uri) return;
    let cancelled = false;
    setDetecting(true);
    setDetectError(null);
    Image.getSize(
      uri,
      (w, h) => {
        if (cancelled) return;
        // Only seed from the device if the server hasn't already weighed in.
        setImageSize((prev) => prev ?? { w, h });
      },
      (err) => {
        if (cancelled) return;
        setDetectError(`Could not read image: ${String(err)}`);
      },
    );
    (async () => {
      const res = await detectQuad(uri);
      if (cancelled) return;
      if (!res.ok) {
        setDetectError(res.error.message);
        setDetecting(false);
        return;
      }
      // image_width/image_height come from the server's view of the JPEG,
      // post-EXIF-correction. This is the authoritative coord space.
      if (res.data.image_width && res.data.image_height) {
        const serverSize = {
          w: res.data.image_width,
          h: res.data.image_height,
        };
        initialImageSizeRef.current = serverSize;
        setImageSize(serverSize);
      }
      initialQuadRef.current = res.data.quad ?? null;
      setDetecting(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [uri]);

  // Compute the canvas (the area where the image is rendered) from the flex
  // region's actual layout. Using onLayout instead of Dimensions/insets math
  // guarantees the canvas can never overflow into the bottom action bar.
  const canvas = useMemo(() => {
    if (!imageSize || !canvasFrame) return null;
    const availW = canvasFrame.w - CANVAS_PADDING * 2;
    const availH = canvasFrame.h - CANVAS_PADDING * 2;
    if (availW <= 0 || availH <= 0) return null;
    const scale = Math.min(availW / imageSize.w, availH / imageSize.h);
    const w = imageSize.w * scale;
    const h = imageSize.h * scale;
    const left = (canvasFrame.w - w) / 2;
    const top = (canvasFrame.h - h) / 2;
    return { left, top, w, h, scale };
  }, [imageSize, canvasFrame]);

  // Seed `points` once the canvas is known.
  useEffect(() => {
    if (!canvas || points.length === 4) return;
    const initialQuad = initialQuadRef.current;
    const initialSize = initialImageSizeRef.current ?? imageSize;
    if (initialQuad && initialSize && initialSize.w > 0 && initialSize.h > 0) {
      const sx = canvas.w / initialSize.w;
      const sy = canvas.h / initialSize.h;
      setPoints(
        initialQuad.map(([x, y]) => [
          canvas.left + x * sx,
          canvas.top + y * sy,
        ]) as Pt[],
      );
    } else {
      // Fallback: a centred 80% rectangle.
      const inset = 0.1;
      const x0 = canvas.left + canvas.w * inset;
      const x1 = canvas.left + canvas.w * (1 - inset);
      const y0 = canvas.top + canvas.h * inset;
      const y1 = canvas.top + canvas.h * (1 - inset);
      setPoints([
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
      ]);
    }
  }, [canvas, imageSize, points.length]);

  const handlePanState = (_i: number) => (
    e: PanGestureHandlerStateChangeEvent,
  ) => {
    if (e.nativeEvent.state === State.BEGAN) {
      dragBaseRef.current = points.map((p) => [...p] as Pt);
    }
  };

  const handlePan = (i: number) => (e: PanGestureHandlerGestureEvent) => {
    if (!canvas) return;
    const base = dragBaseRef.current;
    if (!base) return;
    const next: Pt[] = base.map((p) => [...p] as Pt);
    next[i] = [
      clamp(base[i][0] + e.nativeEvent.translationX, canvas.left, canvas.left + canvas.w),
      clamp(base[i][1] + e.nativeEvent.translationY, canvas.top, canvas.top + canvas.h),
    ];
    setPoints(next);
  };

  const handleContinue = () => {
    if (!uri || !canvas || !imageSize || points.length !== 4) return;
    // Convert canvas-local points back into original-image pixel space.
    const sx = imageSize.w / canvas.w;
    const sy = imageSize.h / canvas.h;
    const quad: Quad = points.map(([x, y]) => [
      Math.round((x - canvas.left) * sx),
      Math.round((y - canvas.top) * sy),
    ]) as Quad;
    router.replace({
      pathname: '/scan-preview',
      params: { uri, quad: JSON.stringify(quad) },
    });
  };

  const polygonPoints = points.length === 4
    ? points.map(([x, y]) => `${x},${y}`).join(' ')
    : '';

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: Tokens.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={Tokens.bg} />

      {}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingTop: insets.top + 12,
          paddingBottom: 8,
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
          <Eyebrow>Adjust corners</Eyebrow>
          <Text
            style={{
              color: Tokens.ink,
              fontFamily: 'PlusJakartaSans_700Bold',
              fontSize: 16,
              marginTop: 2,
            }}
          >
            Frame the page
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {}
      <View
        style={{ flex: 1 }}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setCanvasFrame((prev) =>
            prev && prev.w === width && prev.h === height
              ? prev
              : { w: width, h: height },
          );
        }}
      >
        {uri && canvas ? (
          <Image
            source={{ uri }}
            style={{
              position: 'absolute',
              left: canvas.left,
              top: canvas.top,
              width: canvas.w,
              height: canvas.h,
              borderRadius: 4,
            }}
            resizeMode="contain"
          />
        ) : null}

        {canvas && canvasFrame && points.length === 4 ? (
          <Svg
            width={canvasFrame.w}
            height={canvasFrame.h}
            style={{ position: 'absolute', left: 0, top: 0 }}
            pointerEvents="none"
          >
            <SvgPolygon
              points={polygonPoints}
              fill="rgba(110, 231, 183, 0.18)"
              stroke={Tokens.accent}
              strokeWidth={2}
            />
          </Svg>
        ) : null}

        {detecting ? (
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: '50%',
              alignItems: 'center',
            }}
          >
            <ActivityIndicator size="large" color={Tokens.accent} />
          </View>
        ) : null}

        {points.length === 4
          ? points.map((p, i) => (
              <PanGestureHandler
                key={i}
                onGestureEvent={handlePan(i)}
                onHandlerStateChange={handlePanState(i)}
              >
                <View
                  style={{
                    position: 'absolute',
                    left: p[0] - HANDLE_SIZE / 2,
                    top: p[1] - HANDLE_SIZE / 2,
                    width: HANDLE_SIZE,
                    height: HANDLE_SIZE,
                    borderRadius: 999,
                    backgroundColor: Tokens.accent,
                    borderWidth: 3,
                    borderColor: Tokens.bg,
                    shadowColor: '#000',
                    shadowOpacity: 0.4,
                    shadowRadius: 6,
                    elevation: 5,
                  }}
                />
              </PanGestureHandler>
            ))
          : null}

        {detectError ? (
          <View
            style={{
              position: 'absolute',
              left: 20,
              right: 20,
              top: 16,
              padding: 10,
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
              Auto-detection failed. Drag the corners manually to frame the
              document.
            </Text>
          </View>
        ) : null}
      </View>

      {}
      <View
        style={{
          backgroundColor: Tokens.surface,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          borderTopWidth: 1,
          borderColor: Tokens.hairline,
          paddingTop: 16,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 16,
          gap: 14,
        }}
      >
        <Text
          style={{
            color: Tokens.inkMuted,
            fontFamily: 'PlusJakartaSans_500Medium',
            fontSize: 12,
            textAlign: 'center',
          }}
        >
          Drag the corners to match the document edges, then continue.
        </Text>
        <Button
          label="Continue"
          variant="primary"
          onPress={handleContinue}
          disabled={points.length !== 4}
          trailing={<Ionicons name="arrow-forward" size={18} color={Tokens.accentInk} />}
        />
      </View>
    </GestureHandlerRootView>
  );
}
