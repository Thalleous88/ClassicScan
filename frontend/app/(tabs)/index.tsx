import {
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';

import { router } from 'expo-router';

import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function HomeScreen() {

  return (

    <ThemedView style={styles.container}>

      <View style={styles.header}>

        <ThemedText style={styles.logo}>
          ClassicScan
        </ThemedText>

        <ThemedText style={styles.subtitle}>
          Smart document scanner & OCR extraction
        </ThemedText>

      </View>

      <TouchableOpacity
        style={styles.scanButton}
        onPress={() => router.push('/camera-scan' as any)}
        activeOpacity={0.85}
      >

        <Ionicons
          name="scan-outline"
          size={28}
          color="white"
        />

        <ThemedText style={styles.scanButtonText}>
          Scan Document
        </ThemedText>

      </TouchableOpacity>

      <TouchableOpacity
        style={styles.historyButton}
        onPress={() => router.navigate('/(tabs)/history')}
        activeOpacity={0.85}
      >

        <Ionicons
          name="time-outline"
          size={24}
          color="#0F5C4D"
        />

        <ThemedText style={styles.historyButtonText}>
          View History
        </ThemedText>

      </TouchableOpacity>

    </ThemedView>
  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: '#F4F1E8',
    paddingHorizontal: 24,
    justifyContent: 'center',
  },

  header: {
    marginBottom: 48,
  },

  logo: {
    fontSize: 42,
    fontWeight: '700',
    color: '#0F5C4D',
  },

  subtitle: {
    marginTop: 12,
    fontSize: 16,
    lineHeight: 24,
    color: '#666',
  },

  scanButton: {
    backgroundColor: '#0F5C4D',
    borderRadius: 22,
    paddingVertical: 26,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },

  scanButtonText: {
    color: 'white',
    fontSize: 20,
    fontWeight: '700',
  },

  historyButton: {
    marginTop: 18,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },

  historyButtonText: {
    color: '#0F5C4D',
    fontSize: 16,
    fontWeight: '600',
  },

});