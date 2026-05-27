import React, { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, FlashMode, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Eyebrow } from '@/components/card';
import { Tokens } from '@/constants/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const CAMERA_WIDTH = SCREEN_WIDTH;
const CAMERA_HEIGHT = Math.min(SCREEN_WIDTH * (4 / 3), SCREEN_HEIGHT);
const CAMERA_TOP = Math.max(0, (SCREEN_HEIGHT - CAMERA_HEIGHT) / 2);

const FRAME_PADDING = 32;
const A4_RATIO = 1.414;
let _bracketW = CAMERA_WIDTH - FRAME_PADDING * 2;
let _bracketH = _bracketW * A4_RATIO;
const MAX_BRACKET_H = CAMERA_HEIGHT - 32;
if (_bracketH > MAX_BRACKET_H) {
  _bracketH = MAX_BRACKET_H;
  _bracketW = _bracketH / A4_RATIO;
}
const BRACKET_W = _bracketW;
const BRACKET_H = _bracketH;
const BRACKET_LEFT = (CAMERA_WIDTH - BRACKET_W) / 2;
const BRACKET_TOP = (CAMERA_HEIGHT - BRACKET_H) / 2;

export default function CameraScanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [flashMode, setFlashMode] = useState<FlashMode>('off');
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission?.granted, requestPermission]);

  const toggleFlash = () => {
    setFlashMode((prev) => (prev === 'off' ? 'on' : 'off'));
  };

  const handleCapture = async () => {
    if (!cameraRef.current || capturing) return;
    setError(null);
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1,
        base64: false,
        exif: false,
      });

      if (!photo?.uri) {
        setError('Capture failed: no image returned');
        setCapturing(false);
        return;
      }

      router.push({
        pathname: '/adjust-corners' as any,
        params: {
          uri: photo.uri,
        },
      });
    } catch (err: any) {
      setError(err?.message ?? 'Capture failed');
    } finally {
      setCapturing(false);
    }
  };

  if (!permission) return <View style={{ flex: 1, backgroundColor: Tokens.bg }} />;

  if (!permission.granted) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: Tokens.bg,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 32,
          gap: 20,
        }}
      >
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
          }}
        >
          <Ionicons name="camera-outline" size={26} color={Tokens.inkMuted} />
        </View>
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Eyebrow>Camera access</Eyebrow>
          <Text
            style={{
              color: Tokens.ink,
              fontFamily: 'PlusJakartaSans_700Bold',
              fontSize: 22,
              textAlign: 'center',
            }}
          >
            Permission required
          </Text>
          <Text
            style={{
              color: Tokens.inkMuted,
              fontFamily: 'PlusJakartaSans_400Regular',
              fontSize: 14,
              textAlign: 'center',
            }}
          >
            Allow ClassicScan to use your camera to capture documents.
          </Text>
        </View>
        <Button label="Allow camera" variant="primary" onPress={requestPermission} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Tokens.bg }}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {}
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: CAMERA_TOP,
          width: CAMERA_WIDTH,
          height: CAMERA_HEIGHT,
          backgroundColor: '#000',
          overflow: 'hidden',
        }}
      >
        <CameraView
          ref={cameraRef}
          style={{ flex: 1 }}
          facing="back"
          flash={flashMode}
        />

        {}
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            height: BRACKET_TOP,
            backgroundColor: 'rgba(0,0,0,0.62)',
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: BRACKET_TOP + BRACKET_H,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.62)',
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: BRACKET_TOP,
            width: BRACKET_LEFT,
            height: BRACKET_H,
            backgroundColor: 'rgba(0,0,0,0.62)',
          }}
        />
        <View
          style={{
            position: 'absolute',
            right: 0,
            top: BRACKET_TOP,
            width: CAMERA_WIDTH - BRACKET_LEFT - BRACKET_W,
            height: BRACKET_H,
            backgroundColor: 'rgba(0,0,0,0.62)',
          }}
        />

        {}
        <View
          style={{
            position: 'absolute',
            left: BRACKET_LEFT,
            top: BRACKET_TOP,
            width: 28,
            height: 28,
            borderTopWidth: 2,
            borderLeftWidth: 2,
            borderColor: Tokens.accent,
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: BRACKET_LEFT + BRACKET_W - 28,
            top: BRACKET_TOP,
            width: 28,
            height: 28,
            borderTopWidth: 2,
            borderRightWidth: 2,
            borderColor: Tokens.accent,
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: BRACKET_LEFT,
            top: BRACKET_TOP + BRACKET_H - 28,
            width: 28,
            height: 28,
            borderBottomWidth: 2,
            borderLeftWidth: 2,
            borderColor: Tokens.accent,
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: BRACKET_LEFT + BRACKET_W - 28,
            top: BRACKET_TOP + BRACKET_H - 28,
            width: 28,
            height: 28,
            borderBottomWidth: 2,
            borderRightWidth: 2,
            borderColor: Tokens.accent,
          }}
        />

        {}
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: BRACKET_TOP + BRACKET_H - 40,
            alignItems: 'center',
          }}
        >
          <View
            style={{
              backgroundColor: 'rgba(20,20,24,0.85)',
              borderRadius: 999,
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.10)',
            }}
          >
            <Text
              style={{
                color: '#fff',
                fontFamily: 'PlusJakartaSans_700Bold',
                fontSize: 11,
                letterSpacing: 1.4,
              }}
            >
              ALIGN DOCUMENT WITHIN FRAME
            </Text>
          </View>
        </View>
      </View>

      {}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingTop: insets.top + 8,
          zIndex: 10,
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            width: 40,
            height: 40,
            borderRadius: 999,
            backgroundColor: 'rgba(20,20,24,0.7)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.12)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={20} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={toggleFlash}
          style={{
            width: 40,
            height: 40,
            borderRadius: 999,
            backgroundColor: 'rgba(20,20,24,0.7)',
            borderWidth: 1,
            borderColor:
              flashMode === 'on' ? Tokens.accent : 'rgba(255,255,255,0.12)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          accessibilityLabel="Toggle flash"
        >
          <Ionicons
            name={flashMode === 'on' ? 'flash' : 'flash-off'}
            size={18}
            color={flashMode === 'on' ? Tokens.accent : '#fff'}
          />
        </TouchableOpacity>
      </View>

      {error ? (
        <View
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            top: insets.top + 56,
            backgroundColor: 'rgba(248,113,113,0.92)',
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 8,
            zIndex: 10,
          }}
        >
          <Text
            style={{
              color: Tokens.dangerInk,
              fontFamily: 'PlusJakartaSans_600SemiBold',
              fontSize: 12,
            }}
          >
            {error}
          </Text>
        </View>
      ) : null}

      {}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingTop: 24,
          paddingBottom: insets.bottom + 20,
          alignItems: 'center',
          backgroundColor: Tokens.bg,
          borderTopWidth: 1,
          borderTopColor: Tokens.hairline,
          zIndex: 10,
        }}
      >
        <TouchableOpacity
          onPress={handleCapture}
          activeOpacity={0.85}
          disabled={capturing}
          style={{
            width: 76,
            height: 76,
            borderRadius: 999,
            borderWidth: 2,
            borderColor: Tokens.ink,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: capturing ? 0.6 : 1,
          }}
          accessibilityLabel="Capture"
        >
          <View
            style={{
              width: capturing ? 52 : 56,
              height: capturing ? 52 : 56,
              borderRadius: 999,
              backgroundColor: Tokens.accent,
            }}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}
