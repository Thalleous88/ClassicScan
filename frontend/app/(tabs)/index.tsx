import { TouchableOpacity, StyleSheet } from 'react-native';

import { router } from 'expo-router';

import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';

export default function HomeScreen() {

  return (

    <ThemedView style={styles.container}>

      <TouchableOpacity
        style={styles.button}
        onPress={() => {

          router.push({
            pathname: '/processing',

            params: {
              imageUri:
                'https://images.unsplash.com/photo-1517842645767-c639042777db?q=80&w=1200'
            }
          });

        }}
      >

        <ThemedText style={styles.buttonText}>
          Go To Processing
        </ThemedText>

      </TouchableOpacity>

    </ThemedView>
  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  button: {
    backgroundColor: '#0F5C4D',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },

  buttonText: {
    color: 'white',
    fontWeight: '700',
  },

});