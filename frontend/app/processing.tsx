import { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Image,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';

import { router, useLocalSearchParams } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function ProcessingScreen() {

  const { imageUri } = useLocalSearchParams();

  const [progress, setProgress] = useState(0);

  useEffect(() => {

    const interval = setInterval(() => {

      setProgress((prev) => {

        if (prev >= 100) {

          clearInterval(interval);

          router.push('/ocr-result');

          return 100;
        }

        return prev + 5;
      });

    }, 300);

    return () => clearInterval(interval);

  }, []);

  return (

    <ThemedView style={styles.container}>

      {/* IMAGE PREVIEW */}
      <Image
        source={{ uri: imageUri as string }}
        style={styles.previewImage}
      />

      {/* LOADING */}
      <ActivityIndicator
        size="large"
        color="#0F5C4D"
        style={styles.loader}
      />

      {/* TEXT */}
      <ThemedText style={styles.title}>
        Extracting text...
      </ThemedText>

      <ThemedText style={styles.subtitle}>
        OCR engine is identifying characters
        and converting them into searchable
        data.
      </ThemedText>

      {/* PROGRESS */}
      <View style={styles.progressContainer}>

        <View
          style={[
            styles.progressBar,
            { width: `${progress}%` }
          ]}
        />

      </View>

      <View style={styles.progressTextContainer}>

        <ThemedText style={styles.processingText}>
          PROCESSING
        </ThemedText>

        <ThemedText style={styles.percentText}>
          {progress}%
        </ThemedText>

      </View>

      {/* CANCEL BUTTON */}
      <TouchableOpacity
        style={styles.cancelButton}
        onPress={() => router.back()}
      >

        <ThemedText style={styles.cancelText}>
          Cancel Process
        </ThemedText>

      </TouchableOpacity>

    </ThemedView>
  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: '#F4F4F4',
    paddingHorizontal: 20,
    paddingTop: 40,
    alignItems: 'center',
  },

  previewImage: {
    width: '100%',
    height: 420,
    borderRadius: 12,
    resizeMode: 'cover',
  },

  loader: {
    marginTop: 20,
  },

  title: {
    marginTop: 20,
    fontSize: 24,
    fontWeight: '700',
    color: '#0F5C4D',
  },

  subtitle: {
    marginTop: 10,
    textAlign: 'center',
    color: '#666',
    lineHeight: 22,
    paddingHorizontal: 20,
  },

  progressContainer: {
    width: '100%',
    height: 6,
    backgroundColor: '#D9D9D9',
    borderRadius: 10,
    marginTop: 40,
    overflow: 'hidden',
  },

  progressBar: {
    height: '100%',
    backgroundColor: '#0F5C4D',
  },

  progressTextContainer: {
    width: '100%',
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  processingText: {
    fontSize: 12,
    color: '#777',
    letterSpacing: 1,
  },

  percentText: {
    fontWeight: '700',
    color: '#0F5C4D',
  },

  cancelButton: {
    marginTop: 40,
    borderWidth: 1,
    borderColor: '#D9D9D9',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    backgroundColor: '#FFF',
  },

  cancelText: {
    color: '#666',
  },

});