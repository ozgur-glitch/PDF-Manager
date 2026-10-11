import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Alert,
  SafeAreaView
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';

const STORAGE_KEY = '@pdf_manager_files';

export default function App() {
  const [pdfs, setPdfs] = useState([]);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState('Allgemein');

  useEffect(() => {
    loadPdfs();
  }, []);

  const loadPdfs = async () => {
    try {
      const storedData = await AsyncStorage.getItem(STORAGE_KEY);
      if (storedData !== null) {
        setPdfs(JSON.parse(storedData));
      }
    } catch (error) {
      Alert.alert('Fehler', 'PDFs konnten nicht geladen werden.');
    }
  };

  const savePdfs = async (newPdfs) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newPdfs));
    } catch (error) {
      Alert.alert('Fehler', 'PDFs konnten nicht gespeichert werden.');
    }
  };

  const addPdf = () => {
    if (!title.trim() || !url.trim()) {
      Alert.alert('Hinweis', 'Bitte Titel und URL/Pfad angeben.');
      return;
    }

    const newPdf = {
      id: Date.now().toString(),
      title: title.trim(),
      url: url.trim(),
      category: category.trim() || 'Allgemein',
      date: new Date().toLocaleDateString('de-DE')
    };

    const updatedPdfs = [newPdf, ...pdfs];
    setPdfs(updatedPdfs);
    savePdfs(updatedPdfs);

    setTitle('');
    setUrl('');
  };

  const deletePdf = (id) => {
    Alert.alert('Löschen', 'Möchtest du dieses Dokument wirklich entfernen?', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: () => {
          const updatedPdfs = pdfs.filter((item) => item.id !== id);
          setPdfs(updatedPdfs);
          savePdfs(updatedPdfs);
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📄 PDF-Manager</Text>
        <Text style={styles.headerSubtitle}>Dokumentenverwaltung leicht gemacht</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Neues Dokument hinzufügen</Text>
          <TextInput
            style={styles.input}
            placeholder="Dokumenttitel (z.B. Rechnung Januar)"
            placeholderTextColor="#888"
            value={title}
            onChangeText={setTitle}
          />
          <TextInput
            style={styles.input}
            placeholder="PDF-Link / Speicherpfad (URL)"
            placeholderTextColor="#888"
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder="Kategorie (z.B. Arbeit, Privat)"
            placeholderTextColor="#888"
            value={category}
            onChangeText={setCategory}
          />
          <TouchableOpacity style={styles.addButton} onPress={addPdf}>
            <Text style={styles.addButtonText}>PDF Hinzufügen</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.listHeading}>Gespeicherte Dokumente ({pdfs.length})</Text>

        <FlatList
          data={pdfs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          renderItem={({ item }) => (
            <View style={styles.pdfCard}>
              <View style={styles.pdfInfo}>
                <Text style={styles.pdfTitle}>{item.title}</Text>
                <Text style={styles.pdfUrl} numberOfLines={1}>{item.url}</Text>
                <View style={styles.badgeRow}>
                  <Text style={styles.badge}>{item.category}</Text>
                  <Text style={styles.dateText}>{item.date}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => deletePdf(item.id)}
              >
                <Text style={styles.deleteButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Noch keine PDFs gespeichert.</Text>
          }
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fa',
  },
  header: {
    backgroundColor: '#2563eb',
    paddingVertical: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: '#dbeafe',
    fontSize: 13,
    marginTop: 4,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1f2937',
    marginBottom: 10,
  },
  addButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  listHeading: {
    fontSize: 15,
    fontWeight: '600',
    color: '#4b5563',
    marginBottom: 8,
  },
  listContainer: {
    paddingBottom: 20,
  },
  pdfCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  pdfInfo: {
    flex: 1,
  },
  pdfTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 2,
  },
  pdfUrl: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 6,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badge: {
    backgroundColor: '#eff6ff',
    color: '#1d4ed8',
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
    fontWeight: '500',
    marginRight: 8,
  },
  dateText: {
    fontSize: 11,
    color: '#9ca3af',
  },
  deleteButton: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonText: {
    fontSize: 16,
    color: '#ef4444',
    fontWeight: 'bold',
  },
  emptyText: {
    textAlign: 'center',
    color: '#9ca3af',
    marginTop: 20,
    fontStyle: 'italic',
  },
});
