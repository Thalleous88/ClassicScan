import { useState } from 'react';

import {
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  View,
} from 'react-native';

import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

// placeholder 
const documents = [
  {
    id: '1',
    title: 'Quarterly_Report_Q3.pdf',
    date: 'Oct 24, 2023',
    size: '1.2 MB',
  },
  {
    id: '2',
    title: 'Blue_Bottle_Coffee_Oct.jpg',
    date: 'Oct 22, 2023',
    size: '850 KB',
  },
  {
    id: '3',
    title: 'Home_Reno_Blueprints.pdf',
    date: 'Oct 15, 2023',
    size: '4.5 MB',
  },
];

export default function HistoryScreen() {

  const [search, setSearch] = useState('');

  const filteredDocuments = documents.filter((doc) =>
    doc.title.toLowerCase().includes(
      search.toLowerCase()
    )
  );

  return (

    <ThemedView style={styles.container}>

      <ThemedText style={styles.logo}>
        ClassicScan
      </ThemedText>

      <TextInput
        placeholder="Search previous scans..."
        value={search}
        onChangeText={setSearch}
        style={styles.searchInput}
      />

      <FlatList
        data={filteredDocuments}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingBottom: 120,
        }}
        renderItem={({ item }) => (

          <TouchableOpacity
            style={styles.card}
            onPress={() =>
              router.push('/ocr-result' as any)
            }
          >

            <View style={styles.thumbnail} />

            <View style={styles.cardContent}>

              <ThemedText style={styles.fileName}>
                {item.title}
              </ThemedText>

              <ThemedText style={styles.fileInfo}>
                {item.date} • {item.size}
              </ThemedText>

            </View>

          </TouchableOpacity>
        )}
      />

      <TouchableOpacity
        style={styles.floatingButton}
        onPress={() =>
          router.push('/camera-scan' as any)
        }
      >

        <ThemedText style={styles.floatingText}>
          +
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

  logo: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F5C4D',
    marginBottom: 20,
  },

  searchInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },

  card: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#EAEAEA',
  },

  thumbnail: {
    width: 56,
    height: 56,
    backgroundColor: '#D9D9D9',
    borderRadius: 10,
  },

  cardContent: {
    marginLeft: 14,
    justifyContent: 'center',
    flex: 1,
  },

  fileName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222',
  },

  fileInfo: {
    marginTop: 6,
    color: '#777',
    fontSize: 13,
  },

  floatingButton: {
    position: 'absolute',
    right: 24,
    bottom: 100,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#0F5C4D',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },

  floatingText: {
    color: 'white',
    fontSize: 34,
    fontWeight: '300',
  },

});