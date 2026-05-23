import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  StatusBar,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ScanPreviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { uri } = useLocalSearchParams<{ uri: string }>();

  const handleExtractText = () => {
    // TODO: implement OCR
    console.log('Extract text pressed');
  };

  const handleRescan = () => {
    router.back();
  };

  const handleSavePdf = () => {
    // TODO: implement save PDF
    console.log('Save PDF pressed');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F0E8" />

      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="search" size={20} color="#1a1a1a" />
        <Text style={styles.headerTitle}>ClassicScan</Text>
      </View>

      {/* Scrollable content */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>

        {/* Document preview card */}
        <View style={styles.previewCard}>
          {/* Enhanced badge */}
          <View style={styles.enhancedBadge}>
            <Text style={styles.enhancedText}>ENHANCED</Text>
          </View>

          {/* Document image */}
          {uri ? (
            <Image
              source={{ uri }}
              style={styles.documentImage}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.documentPlaceholder} />
          )}
        </View>
      </ScrollView>

      {/* Bottom action sheet */}
      <View style={[styles.bottomSheet, { paddingBottom: insets.bottom + 16 }]}>
        {/* Action buttons row */}
        <View style={styles.actionRow}>
          {/* Extract Text */}
          <TouchableOpacity style={styles.actionItem} onPress={handleExtractText} activeOpacity={0.7}>
            <View style={styles.actionIconCircle}>
              <Ionicons name="text" size={22} color="#555" />
            </View>
            <Text style={styles.actionLabel}>Extract Text (Using OCR)</Text>
          </TouchableOpacity>

          {/* Rescan */}
          <TouchableOpacity style={styles.actionItem} onPress={handleRescan} activeOpacity={0.7}>
            <View style={styles.actionIconCircle}>
              <Ionicons name="refresh" size={22} color="#555" />
            </View>
            <Text style={styles.actionLabel}>Rescan</Text>
          </TouchableOpacity>
        </View>

        {/* Save PDF button */}
        <TouchableOpacity style={styles.savePdfButton} onPress={handleSavePdf} activeOpacity={0.85}>
          <Ionicons name="save-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.savePdfText}>SAVE PDF DOCUMENT</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F0E8',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
    letterSpacing: 0.2,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    flexGrow: 1,
  },
  previewCard: {
    backgroundColor: '#E8E4DC',
    borderRadius: 20,
    padding: 20,
    minHeight: 480,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  enhancedBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    backgroundColor: '#2d6e52',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    zIndex: 1,
  },
  enhancedText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  documentImage: {
    width: '80%',
    height: 380,
    borderRadius: 4,
  },
  documentPlaceholder: {
    width: '80%',
    height: 380,
    backgroundColor: '#d0ccc4',
    borderRadius: 4,
  },
  bottomSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 28,
    paddingHorizontal: 24,
    gap: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 10,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 40,
  },
  actionItem: {
    alignItems: 'center',
    gap: 8,
  },
  actionIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 12,
    color: '#444',
    textAlign: 'center',
    maxWidth: 100,
  },
  savePdfButton: {
    backgroundColor: '#1a4a35',
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  savePdfText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
  },
});