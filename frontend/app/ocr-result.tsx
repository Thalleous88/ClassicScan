import { useState } from 'react';

import {
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  View,
  TextInput,
} from 'react-native';

import * as Clipboard from 'expo-clipboard';

import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function OCRResultScreen() {

  const [copied, setCopied] = useState(false);

  // dummy aja
  const [ocrText, setOcrText] = useState(`
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
  `);

  async function handleCopy() {

    await Clipboard.setStringAsync(ocrText);

    setCopied(true);

    setTimeout(() => {
      setCopied(false);
    }, 2000);
  }

  return (

    <ThemedView style={styles.container}>

      <View style={styles.header}>

        <TextInput
        multiline
        value={ocrText}
        onChangeText={setOcrText}
        style={styles.ocrInput}
        textAlignVertical="top"
        />

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

      <TouchableOpacity
        style={styles.copyButton}
        onPress={handleCopy}
      >

        <ThemedText style={styles.copyText}>
            {copied ? 'Copied!' : 'Copy'}
        </ThemedText>

      </TouchableOpacity>

      <TouchableOpacity
        style={styles.nextButton}
        onPress={() => router.navigate('/(tabs)/history')}
      >

        <ThemedText style={styles.nextText}>
          Next
        </ThemedText>

      </TouchableOpacity>

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

  ocrInput: {
    fontSize: 16,
    lineHeight: 28,
    color: '#333',
    minHeight: 400,
  },

  copyButton: {
    alignItems: 'center',
    marginTop: 16,
  },

  copyText: {
    color: '#777',
    fontSize: 15,
  },

  nextButton: {
    backgroundColor: '#0F5C4D',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
  },

  nextText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },

});