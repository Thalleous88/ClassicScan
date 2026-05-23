import {
  StyleSheet,
  TouchableOpacity,
  View,
  ScrollView,
  Text,
} from 'react-native';

import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ThemedView } from '@/components/themed-view';

const RECENT_SCANS = [
  {
    id: '1',
    name: 'Q4_Invoice_2023.pdf',
    date: 'Oct 24, 2023',
    size: '2.4 MB',
    tag: 'Finance',
    icon: 'document-text-outline',
  },
  {
    id: '2',
    name: 'Travel_Notes_Japan.jpg',
    date: 'Oct 21, 2023',
    size: '5.1 MB',
    tag: 'Personal',
    icon: 'image-outline',
  },
  {
    id: '3',
    name: 'Office_Layout_V2.pdf',
    date: 'Oct 19, 2023',
    size: '12.8 MB',
    tag: 'Work',
    icon: 'document-outline',
  },
];

const TAG_COLORS: Record<string, { bg: string; text: string }> = {
  Finance:  { bg: '#E8F4F0', text: '#0F5C4D' },
  Personal: { bg: '#F0EDE6', text: '#7A6A50' },
  Work:     { bg: '#F0F0F0', text: '#555555' },
};

export default function HomeScreen() {
  return (
    <ThemedView style={styles.container}>

      <View style={styles.topBar}>
        <Text style={styles.appName}>ClassicScan</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        <View style={styles.scanSection}>
          <TouchableOpacity
            style={styles.scanRingOuter}
            activeOpacity={0.85}
            onPress={() => router.push('/camera-scan' as any)}
          >
            <View style={styles.scanRingInner}>
              <View style={styles.scanButton}>
                <Ionicons name="camera-outline" size={36} color="#FFFFFF" />
                <Text style={styles.scanLabel}>SCAN</Text>
              </View>
            </View>
          </TouchableOpacity>
          <Text style={styles.scanHint}>Ready for a new document</Text>
        </View>

        <View style={styles.recentSection}>

          <View style={styles.recentHeader}>
            <Text style={styles.recentTitle}>Recent Scans</Text>
            <TouchableOpacity onPress={() => router.navigate('/(tabs)/history')}>
              <Text style={styles.viewAll}>View all</Text>
            </TouchableOpacity>
          </View>

          {RECENT_SCANS.map((item) => {
            const tag = TAG_COLORS[item.tag] ?? { bg: '#EEE', text: '#333' };
            return (
              <TouchableOpacity
                key={item.id}
                style={styles.scanCard}
                activeOpacity={0.8}
                onPress={() => router.push('/ocr-result' as any)}
              >
                <View style={styles.thumbnail}>
                  <Ionicons name={item.icon as any} size={28} color="#888" />
                </View>

                <View style={styles.cardInfo}>
                  <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.cardMeta}>{item.date} • {item.size}</Text>
                  <View style={[styles.tagBadge, { backgroundColor: tag.bg }]}>
                    <Text style={[styles.tagText, { color: tag.text }]}>{item.tag}</Text>
                  </View>
                </View>

                <Ionicons name="chevron-forward" size={18} color="#CCC" />

              </TouchableOpacity>
            );
          })}

        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: '#F4F1E8',
  },

  topBar: {
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 12,
    backgroundColor: '#F4F1E8',
  },
  appName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F5C4D',
    letterSpacing: -0.5,
  },

  scrollContent: {
    paddingBottom: 40,
  },

  scanSection: {
    alignItems: 'center',
    paddingVertical: 36,
  },
  scanRingOuter: {
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: '#D6D3CC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  scanRingInner: {
    width: 148,
    height: 148,
    borderRadius: 74,
    backgroundColor: '#C8C5BE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanButton: {
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: '#0F5C4D',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    shadowColor: '#0F5C4D',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  scanLabel: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  scanHint: {
    fontSize: 14,
    color: '#888',
    letterSpacing: 0.1,
  },

  recentSection: {
    paddingHorizontal: 20,
  },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  recentTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F5C4D',
    letterSpacing: -0.3,
  },
  viewAll: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F5C4D',
  },

  scanCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    gap: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  thumbnail: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: '#EBEBEB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    flex: 1,
    gap: 4,
  },
  cardName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
    letterSpacing: -0.1,
  },
  cardMeta: {
    fontSize: 12,
    color: '#999',
  },
  tagBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    marginTop: 2,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '600',
  },

});