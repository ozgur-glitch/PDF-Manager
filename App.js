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
  SafeAreaView,
  ScrollView,
  Modal
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { WebView } from 'react-native-webview';
import { StatusBar } from 'expo-status-bar';
import { PDFDocument, degrees } from 'pdf-lib';

const STORAGE_KEY = '@pdf_manager_files';

export default function App() {
  const [pdfs, setPdfs] = useState([]);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Allgemein');
  const [selectedFile, setSelectedFile] = useState(null);

  // Zustand für die echte Live-Vorschau
  const [previewItem, setPreviewItem] = useState(null);
  const [currentRotation, setCurrentRotation] = useState(0);

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

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        setSelectedFile(file);
        if (!title.trim()) {
          setTitle(file.name.replace(/\.[^/.]+$/, ''));
        }
      }
    } catch (error) {
      Alert.alert('Fehler', 'Datei konnte nicht ausgewählt werden.');
    }
  };

  const addPdf = () => {
    if (!title.trim() || !selectedFile) {
      Alert.alert('Hinweis', 'Bitte einen Titel eingeben und eine PDF-Datei auswählen.');
      return;
    }

    const newPdf = {
      id: Date.now().toString(),
      title: title.trim(),
      uri: selectedFile.uri,
      fileName: selectedFile.name,
      category: category.trim() || 'Allgemein',
      date: new Date().toLocaleDateString('de-DE')
    };

    const updatedPdfs = [newPdf, ...pdfs];
    setPdfs(updatedPdfs);
    savePdfs(updatedPdfs);

    setTitle('');
    setSelectedFile(null);
  };

  const savePdfToDeviceFolder = async (item) => {
    try {
      if (Platform.OS === 'android') {
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!permissions.granted) return;

        const base64Data = await FileSystem.readAsStringAsync(item.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const targetUri = await FileSystem.StorageAccessFramework.createFileAsync(
          permissions.directoryUri,
          item.fileName || 'dokument.pdf',
          'application/pdf'
        );

        await FileSystem.writeAsStringAsync(targetUri, base64Data, {
          encoding: FileSystem.EncodingType.Base64,
        });

        Alert.alert('Erfolg', 'PDF wurde erfolgreich im Handy-Ordner gespeichert!');
      }
    } catch (error) {
      Alert.alert('Fehler', 'Speichern fehlgeschlagen.');
    }
  };

  // Vorschau öffnen
  const openPreview = (item) => {
    setPreviewItem(item);
    setCurrentRotation(0);
  };

  // PDF drehen mit Live-Auswirkung auf die Vorschau
  const rotateInPreview = async () => {
    if (!previewItem) return;
    try {
      const nextRot = (currentRotation + 90) % 360;
      setCurrentRotation(nextRot);

      const fileBytes = await FileSystem.readAsStringAsync(previewItem.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const pdfDoc = await PDFDocument.load(fileBytes);
      const pages = pdfDoc.getPages();
      
      pages.forEach((page) => {
        page.setRotation(degrees(nextRot));
      });

      const modifiedPdfBytes = await pdfDoc.saveAsBase64();
      const newUri = `${FileSystem.cacheDirectory}${Date.now()}_rotated.pdf`;
      
      await FileSystem.writeAsStringAsync(newUri, modifiedPdfBytes, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const updatedItem = { ...previewItem, uri: newUri };
      setPreviewItem(updatedItem);

      const updatedPdfs = pdfs.map((p) => (p.id === previewItem.id ? updatedItem : p));
      setPdfs(updatedPdfs);
      savePdfs(updatedPdfs);
    } catch (error) {
      Alert.alert('Fehler', 'Drehen fehlgeschlagen.');
    }
  };

  const mergePdfs = async () => {
    if (pdfs.length < 2) {
      Alert.alert('Hinweis', 'Du brauchst mindestens 2 PDFs in der Liste, um sie zusammenzuführen.');
      return;
    }

    try {
      const mergedPdf = await PDFDocument.create();

      for (let i = 0; i < 2; i++) {
        const fileBytes = await FileSystem.readAsStringAsync(pdfs[i].uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const donorPdf = await PDFDocument.load(fileBytes);
        const copiedPages = await mergedPdf.copyPages(donorPdf, donorPdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      }

      const mergedPdfBytes = await mergedPdf.saveAsBase64();
      const newUri = `${FileSystem.cacheDirectory}${Date.now()}_merged.pdf`;

      await FileSystem.writeAsStringAsync(newUri, mergedPdfBytes, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const newMergedItem = {
        id: Date.now().toString(),
        title: `Zusammengeführt (${pdfs[0].title} + ${pdfs[1].title})`,
        uri: newUri,
        fileName: 'merged_document.pdf',
        category: 'Zusammengeführt',
        date: new Date().toLocaleDateString('de-DE')
      };

      const updatedPdfs = [newMergedItem, ...pdfs];
      setPdfs(updatedPdfs);
      savePdfs(updatedPdfs);

      Alert.alert('Erfolg', 'PDFs wurden erfolgreich zusammengefügt!');
    } catch (error) {
      Alert.alert('Fehler', 'Zusammenführen fehlgeschlagen.');
    }
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
        <Text style={styles.headerSubtitle}>Mit echter Dokumenten-Vorschau</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
        <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Neues PDF hinzufügen</Text>

            <TextInput
              style={styles.input}
              placeholder="Dokumenttitel"
              placeholderTextColor="#888"
              value={title}
              onChangeText={setTitle}
            />

            <TextInput
              style={styles.input}
              placeholder="Kategorie"
              placeholderTextColor="#888"
              value={category}
              onChangeText={setCategory}
            />

            <TouchableOpacity style={styles.filePickerButton} onPress={pickDocument}>
              <Text style={styles.filePickerButtonText}>
                {selectedFile ? `📁 ${selectedFile.name}` : '📂 PDF-Datei wählen'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.addButton} onPress={addPdf}>
              <Text style={styles.addButtonText}>PDF Speichern</Text>
            </TouchableOpacity>
          </View>

          {pdfs.length >= 2 && (
            <TouchableOpacity style={styles.mergeButton} onPress={mergePdfs}>
              <Text style={styles.mergeButtonText}>🔗 Die ersten 2 PDFs zusammenführen</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.listHeading}>Gespeicherte Dokumente ({pdfs.length}) - Tippe zum Ansehen & Drehen:</Text>

          {pdfs.map((item) => (
            <TouchableOpacity key={item.id} style={styles.pdfCard} onPress={() => openPreview(item)}>
              <View style={styles.pdfInfo}>
                <Text style={styles.pdfTitle}>{item.title}</Text>
                <Text style={styles.pdfUrl} numberOfLines={1}>{item.fileName}</Text>
                <View style={styles.badgeRow}>
                  <Text style={styles.badge}>{item.category}</Text>
                  <Text style={styles.dateText}>{item.date}</Text>
                </View>
              </View>

              <View style={styles.actionButtons} onStartShouldSetResponder={() => true}>
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => savePdfToDeviceFolder(item)}
                >
                  <Text style={styles.iconText}>💾</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => deletePdf(item.id)}
                >
                  <Text style={styles.deleteButtonText}>✕</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))}

          {pdfs.length === 0 && (
            <Text style={styles.emptyText}>Noch keine PDFs gespeichert.</Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ECHTE PDF-VORSCHAU MODAL */}
      <Modal visible={previewItem !== null} animationType="slide" transparent={false}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle} numberOfLines={1}>{previewItem?.title}</Text>
            <TouchableOpacity style={styles.closeTopButton} onPress={() => setPreviewItem(null)}>
              <Text style={styles.closeTopButtonText}>✕ Schließen</Text>
            </TouchableOpacity>
          </View>

          {/* Zeigt das echte PDF direkt an */}
          <View style={styles.pdfViewerContainer}>
            {previewItem && (
              <WebView
                source={{ uri: `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(previewItem.uri)}` }}
                style={styles.webview}
              />
            )}
          </View>

          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.rotateModalButton} onPress={rotateInPreview}>
              <Text style={styles.rotateModalButtonText}>🔄 Um 90° drehen ({currentRotation}°)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.saveModalButton}
              onPress={() => savePdfToDeviceFolder(previewItem)}
            >
              <Text style={styles.saveModalButtonText}>💾 Auf Handy speichern</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
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
    marginBottom: 12,
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
  filePickerButton: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  filePickerButtonText: {
    color: '#1d4ed8',
    fontSize: 14,
    fontWeight: '500',
  },
  addButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  mergeButton: {
    backgroundColor: '#10b981',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  mergeButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  listHeading: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4b5563',
    marginBottom: 8,
  },
  pdfCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 12,
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
    marginRight: 6,
  },
  pdfTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 2,
  },
  pdfUrl: {
    fontSize: 11,
    color: '#6b7280',
    marginBottom: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badge: {
    backgroundColor: '#eff6ff',
    color: '#1d4ed8',
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
    fontWeight: '500',
    marginRight: 6,
  },
  dateText: {
    fontSize: 10,
    color: '#9ca3af',
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    padding: 6,
    marginRight: 4,
  },
  iconText: {
    fontSize: 18,
  },
  deleteButton: {
    padding: 6,
  },
  deleteButtonText: {
    fontSize: 18,
    color: '#ef4444',
    fontWeight: 'bold',
  },
  emptyText: {
    textAlign: 'center',
    color: '#9ca3af',
    marginTop: 20,
    fontStyle: 'italic',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1f2937',
    flex: 1,
    marginRight: 10,
  },
  closeTopButton: {
    padding: 6,
  },
  closeTopButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ef4444',
  },
  pdfViewerContainer: {
    flex: 1,
    backgroundColor: '#e5e7eb',
  },
  webview: {
    flex: 1,
  },
  modalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  rotateModalButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  rotateModalButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  saveModalButton: {
    backgroundColor: '#10b981',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveModalButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
