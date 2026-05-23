import {
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  View,
} from 'react-native';

import { router } from 'expo-router';

import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function OCRResultScreen() {
console.log("NEW OCR RESULT");
  const ocrText = `
ALEX RIVERA
Creative Director & Digital Archivist

CONTACT INFORMATION:
Email: hello@alxrivdesign.com
Phone: +1 (555) 012-3456
Office 124 High Street, Suite 400
New York, NY 10001

PROJECT SUMMARY:
The 2023 Quarterly Digital Review
focuses on the implementation of
minimalist UX principles across
corporate archiving tools.
`;

  const handleSavePdf = () => {

  console.log('Save PDF');

  router.navigate('/(tabs)/history');

};

  const handleSaveDoc = () => {

  console.log('Save DOC');

  router.navigate('/(tabs)/history');

};

  return (

    <ThemedView style={styles.container}>

      <View style={styles.header}>

        <ThemedText style={styles.logo}>
          ClassicScan
        </ThemedText>

      </View>

      <View style={styles.card}>

        <ThemedText style={styles.label}>
          EXTRACTED TEXT
        </ThemedText>

        <ScrollView
          style={styles.scrollArea}
          showsVerticalScrollIndicator={false}
        >

          <ThemedText style={styles.ocrText}>
            {ocrText}
          </ThemedText>

        </ScrollView>

      </View>

      <View style={styles.buttonRow}>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={handleSaveDoc}
          activeOpacity={0.85}
        >

          <Ionicons
            name="document-text-outline"
            size={20}
            color="#0F5C4D"
          />

          <ThemedText style={styles.secondaryButtonText}>
            Save as DOC
          </ThemedText>

        </TouchableOpacity>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleSavePdf}
          activeOpacity={0.85}
        >

          <Ionicons
            name="download-outline"
            size={20}
            color="white"
          />

          <ThemedText style={styles.primaryButtonText}>
            Save as PDF
          </ThemedText>

        </TouchableOpacity>

      </View>

    </ThemedView>
  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: '#F4F1E8',
    paddingTop: 60,
    paddingHorizontal: 20,
  },

  header: {
    marginBottom: 24,
  },

  logo: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F5C4D',
  },

  card: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },

  label: {
    fontSize: 12,
    letterSpacing: 1.5,
    color: '#999',
    marginBottom: 18,
  },

  scrollArea: {
    flex: 1,
  },

  ocrText: {
    fontSize: 16,
    lineHeight: 28,
    color: '#333',
  },

  buttonRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 20,
    marginBottom: 40,
  },

  secondaryButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    borderWidth: 1,
    borderColor: '#DCDCDC',
  },

  secondaryButtonText: {
    color: '#0F5C4D',
    fontSize: 15,
    fontWeight: '700',
  },

  primaryButton: {
    flex: 1,
    backgroundColor: '#0F5C4D',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },

  primaryButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '700',
  },

});