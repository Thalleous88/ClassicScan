import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  Platform,
} from 'react-native';
import { CameraView, CameraType, FlashMode, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const FRAME_PADDING = 32;
const FRAME_WIDTH = SCREEN_WIDTH - FRAME_PADDING * 2;
const FRAME_HEIGHT = FRAME_WIDTH * 1.414; // A4 ratio
const CORNER_SIZE = 28;
const CORNER_THICKNESS = 3;

export default function CameraScanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [flashMode, setFlashMode] = useState<FlashMode>('off');
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, []);

  const toggleFlash = () => {
    setFlashMode((prev) => (prev === 'off' ? 'on' : 'off'));
  };

  const handleCapture = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1,
        base64: false,
      });
      // Navigate to preview or process result
      router.push({ pathname: '/scan-preview', params: { uri: photo?.uri } });
      console.log('Photo taken:', photo?.uri);
    } catch (err) {
      console.error('Capture error:', err);
    }
  };

  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.permissionContainer]}>
        <Text style={styles.permissionText}>Izin kamera diperlukan untuk scan dokumen.</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Izinkan Kamera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const frameTop = (SCREEN_HEIGHT - FRAME_HEIGHT) / 2 - 40;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Camera */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        flash={flashMode}
      />

      {/* Dark overlay — top */}
      <View style={[styles.overlay, { height: frameTop }]} />

      {/* Middle row: dark sides + frame */}
      <View style={[styles.middleRow, { top: frameTop, height: FRAME_HEIGHT }]}>
        <View style={[styles.overlaySide, { width: FRAME_PADDING }]} />

        {/* Transparent frame area */}
        <View style={{ width: FRAME_WIDTH, height: FRAME_HEIGHT }}>
          {/* Corner: top-left */}
          <View style={[styles.corner, styles.cornerTopLeft]} />
          {/* Corner: top-right */}
          <View style={[styles.corner, styles.cornerTopRight]} />
          {/* Corner: bottom-left */}
          <View style={[styles.corner, styles.cornerBottomLeft]} />
          {/* Corner: bottom-right */}
          <View style={[styles.corner, styles.cornerBottomRight]} />
        </View>

        <View style={[styles.overlaySide, { width: FRAME_PADDING }]} />
      </View>

      {/* Dark overlay — bottom */}
      <View
        style={[
          styles.overlay,
          {
            top: frameTop + FRAME_HEIGHT,
            bottom: 0,
          },
        ]}
      />

      {/* Top controls */}
      <View style={[styles.topControls, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.iconButton} onPress={toggleFlash}>
          <Ionicons
            name={flashMode === 'on' ? 'flash' : 'flash-off'}
            size={22}
            color="#fff"
          />
        </TouchableOpacity>
      </View>

      {/* Hint label */}
      <View style={[styles.hintContainer, { top: frameTop + FRAME_HEIGHT - 56 }]}>
        <View style={styles.hintPill}>
          <Text style={styles.hintText}>ALIGN DOCUMENT WITHIN FRAME</Text>
        </View>
      </View>

      {/* Bottom capture area */}
      <View
        style={[
          styles.bottomControls,
          { paddingBottom: insets.bottom + 16 },
        ]}>
        <TouchableOpacity
          style={styles.captureButton}
          onPress={handleCapture}
          activeOpacity={0.85}>
          <View style={styles.captureInner} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  middleRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
  },
  overlaySide: {
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  // Corner brackets
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: '#fff',
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
  },
  // Top controls
  topControls: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 10,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Hint
  hintContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  hintPill: {
    backgroundColor: 'rgba(30,30,30,0.82)',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  hintText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.2,
  },
  // Bottom
  bottomControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#111',
    alignItems: 'center',
    paddingTop: 24,
    zIndex: 10,
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1a5c46',
  },
  // Permission fallback
  permissionContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 32,
  },
  permissionText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
  },
  permissionButton: {
    backgroundColor: '#1a5c46',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  permissionButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
});