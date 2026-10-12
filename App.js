import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
  SafeAreaView,
  Modal,
  Switch
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import Pdf from 'react-native-pdf';
import { StatusBar } from 'expo-status-bar';
import { PDFDocument, degrees } from 'pdf-lib';

const STORAGE_KEY = '@pdf_manager_files';
const THEME_KEY = '@pdf_manager_theme';

export default function App() {
  const [pdfs, setPdfs] = useState([]);
  const [previewItem, setPreviewItem] = useState(null);
  const [currentRotation, setCurrentRotation] = useState(0);

  // Darkmode State
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Multi-Select / Merge State
  const [isMergingMode, setIsMergingMode] = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState([]);

  useEffect(() => {
    loadPdfs();
    loadTheme();
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

  const loadTheme = async () => {
    try {
      const theme = await AsyncStorage.getItem(THEME_KEY);
      if (theme !== null) {
        setIsDarkMode(theme === 'dark');
      }
    } catch (error) {
      // Standard: Light Mode
    }
  };

  const toggleTheme = async (val) => {
    setIsDarkMode(val);
    try {
      await AsyncStorage.setItem(THEME_KEY, val ? 'dark' : 'light');
    } catch (error) {
      // Fehler beim Speichern des Themes
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
        multiple: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newFiles = result.assets.map((file) => ({
          id: Date.now().toString() + Math.random(),
          title: file.name.replace(/\.[^/.]+$/, ''),
          uri: file.uri,
          fileName: file.name,
          date: new Date().toLocaleDateString('de-DE')
        }));

        const updatedPdfs = [...newFiles, ...pdfs];
        setPdfs(updatedPdfs);
        savePdfs(updatedPdfs);
      }
    } catch (error) {
      Alert.alert('Fehler', 'Dateien konnten nicht ausgewählt werden.');
    }
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

  const openPreview = (item) => {
    setPreviewItem(item);
    setCurrentRotation(0);
  };

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

      setPreviewItem({ ...previewItem, uri: newUri });
    } catch (error) {
      Alert.alert('Fehler', 'Drehen fehlgeschlagen.');
    }
  };

  const saveRotatedChanges = () => {
    if (!previewItem) return;
    const updatedPdfs = pdfs.map((p) => (p.id === previewItem.id ? previewItem : p));
    setPdfs(updatedPdfs);
    savePdfs(updatedPdfs);
    Alert.alert('Gespeichert', 'Die Änderungen wurden übernommen.');
  };

  const toggleSelectForMerge = (id) => {
    if (selectedForMerge.includes(id)) {
      setSelectedForMerge(selectedForMerge.filter((item) => item !== id));
    } else {
      setSelectedForMerge([...selectedForMerge, id]);
    }
  };

  const executeMerge = async () => {
    if (selectedForMerge.length < 2) {
      Alert.alert('Hinweis', 'Bitte wähle mindestens 2 PDFs aus.');
      return;
    }

    try {
      const mergedPdf = await PDFDocument.create();

      for (const id of selectedForMerge) {
        const item = pdfs.find((p) => p.id === id);
        if (item) {
          const fileBytes = await FileSystem.readAsStringAsync(item.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const donorPdf = await PDFDocument.load(fileBytes);
          const copiedPages = await mergedPdf.copyPages(donorPdf, donorPdf.getPageIndices());
          copiedPages.forEach((page) => mergedPdf.addPage(page));
        }
      }

      const mergedPdfBytes = await mergedPdf.saveAsBase64();
      const newUri = `${FileSystem.cacheDirectory}${Date.now()}_merged.pdf`;

      await FileSystem.writeAsStringAsync(newUri, mergedPdfBytes, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const newMergedItem = {
        id: Date.now().toString(),
        title: `Zusammengeführt_${selectedForMerge.length}_Dateien`,
        uri: newUri,
        fileName: 'zusammengefuegt.pdf',
        date: new Date().toLocaleDateString('de-DE')
      };

      const updatedPdfs = [newMergedItem, ...pdfs];
      setPdfs(updatedPdfs);
      savePdfs(updatedPdfs);

      setIsMergingMode(false);
      setSelectedForMerge([]);
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

  // Alle PDFs auf einmal löschen
  const deleteAllPdfs = () => {
    if (pdfs.length === 0) return;
    Alert.alert(
      'Alle löschen',
      'Möchtest du wirklich ALLE gespeicherten PDFs unwiderruflich löschen?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Alle Löschen',
          style: 'destructive',
          onPress: () => {
            setPdfs([]);
            savePdfs([]);
            setSelectedForMerge([]);
          },
        },
      ]
    );
  };

  // Theme-abhängige Farbzuweisung
  const currentStyles = isDarkMode ? darkStyles : lightStyles;

  return (
    <SafeAreaView style={[styles.container, currentStyles.container]}>
      <StatusBar style={isDarkMode ? 'light' : 'light'} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📄 PDF-Manager</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Dark Mode Switch */}
        <View style={[styles.cardRow, currentStyles.card]}>
          <Text style={[styles.rowText, currentStyles.text]}>🌙 Dunkler Modus</Text>
          <Switch value={isDarkMode} onValueChange={toggleTheme} />
        </View>

        {/* Action Buttons */}
        <TouchableOpacity style={styles.pickerButton} onPress={pickDocument}>
          <Text style={styles.pickerButtonText}>📂 PDFs auswählen & hinzufügen</Text>
        </TouchableOpacity>

        <View style={[styles.cardRow, currentStyles.card]}>
          <Text style={[styles.rowText, currentStyles.text]}>Mehrere PDFs zusammenführen</Text>
          <Switch
            value={isMergingMode}
            onValueChange={(val) => {
              setIsMergingMode(val);
              setSelectedForMerge([]);
            }}
          />
        </View>

        {isMergingMode && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#10b981', marginBottom: 12 }]}
            onPress={executeMerge}
          >
            <Text style={styles.actionBtnText}>
              🔗 Ausgewählte ({selectedForMerge.length}) zusammenführen
            </Text>
          </TouchableOpacity>
        )}

        {/* Liste Header & Alle löschen */}
        <View style={styles.listHeaderRow}>
          <Text style={[styles.listHeading, currentStyles.subText]}>
            Dokumente ({pdfs.length}):
          </Text>
          {pdfs.length > 0 && (
            <TouchableOpacity onPress={deleteAllPdfs} style={styles.deleteAllBtn}>
              <Text style={styles.deleteAllBtnText}>🗑️ Alle löschen</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* PDF Liste */}
        {pdfs.map((item) => {
          const isSelected = selectedForMerge.includes(item.id);
          return (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.pdfCard,
                currentStyles.card,
                isSelected && styles.pdfCardSelected
              ]}
              onPress={() => {
                if (isMergingMode) {
                  toggleSelectForMerge(item.id);
                } else {
                  openPreview(item);
                }
              }}
            >
              <View style={styles.pdfInfo}>
                <Text style={[styles.pdfTitle, currentStyles.text]} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={[styles.dateText, currentStyles.subText]}>{item.date}</Text>
              </View>

              {!isMergingMode && (
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
              )}
            </TouchableOpacity>
          );
        })}

        {pdfs.length === 0 && (
          <Text style={[styles.emptyText, currentStyles.subText]}>
            Noch keine PDFs vorhanden.
          </Text>
        )}

        {/* Entwicklerinfo */}
        <View style={[styles.developerCard, currentStyles.card]}>
          <Text style={[styles.devTitle, currentStyles.text]}>👨‍💻 Entwicklerinfo</Text>
          <Text style={[styles.devText, currentStyles.subText]}>Entwickler: Özgür Cetin</Text>
          <Text style={[styles.devText, currentStyles.subText]}>E-Mail: ozgur.cetin@web.de</Text>
        </View>
      </ScrollView>

      {/* VORSCHAU & BEARBEITUNGS-MODAL */}
      <Modal visible={previewItem !== null} animationType="slide" transparent={false}>
        <SafeAreaView style={[styles.modalContainer, currentStyles.container]}>
          <View style={[styles.modalHeader, currentStyles.modalHeader]}>
            <Text style={[styles.modalTitle, currentStyles.text]} numberOfLines={1}>
              {previewItem?.title}
            </Text>
            <TouchableOpacity style={styles.closeTopButton} onPress={() => setPreviewItem(null)}>
              <Text style={styles.closeTopButtonText}>✕ Schließen</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.pdfViewerContainer}>
            {previewItem && (
              <Pdf
                trustAllCerts={false}
                source={{ uri: previewItem.uri, cache: true }}
                style={styles.pdfViewer}
              />
            )}
          </View>

          <View style={[styles.modalFooter, currentStyles.modalFooter]}>
            <TouchableOpacity style={styles.rotateModalButton} onPress={rotateInPreview}>
              <Text style={styles.rotateModalButtonText}>🔄 Um 90° drehen ({currentRotation}°)</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.applyModalButton} onPress={saveRotatedChanges}>
              <Text style={styles.applyModalButtonText}>✔️ Änderungen übernehmen</Text>
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

const lightStyles = StyleSheet.create({
  container: { backgroundColor: '#f5f7fa' },
  card: { backgroundColor: '#ffffff', borderColor: '#e5e7eb' },
  text: { color: '#1f2937' },
  subText: { color: '#6b7280' },
  modalHeader: { borderBottomColor: '#e5e7eb' },
  modalFooter: { backgroundColor: '#f9fafb', borderTopColor: '#e5e7eb' },
});

const darkStyles = StyleSheet.create({
  container: { backgroundColor: '#111827' },
  card: { backgroundColor: '#1f2937', borderColor: '#374151' },
  text: { color: '#f9fafb' },
  subText: { color: '#9ca3af' },
  modalHeader: { borderBottomColor: '#374151' },
  modalFooter: { backgroundColor: '#1f2937', borderTopColor: '#374151' },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    backgroundColor: '#2563eb',
    paddingVertical: 18,
    alignItems: 'center',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  content: {
    padding: 16,
  },
  cardRow: {
    padding: 12,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
  },
  rowText: {
    fontSize: 14,
    fontWeight: '600',
  },
  pickerButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  pickerButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  actionBtn: {
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  listHeading: {
    fontSize: 14,
    fontWeight: '600',
  },
  deleteAllBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  deleteAllBtnText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '600',
  },
  pdfCard: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  pdfCardSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  pdfInfo: {
    flex: 1,
    marginRight: 6,
  },
  pdfTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  dateText: {
    fontSize: 11,
    marginTop: 2,
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
    marginTop: 20,
    fontStyle: 'italic',
  },
  developerCard: {
    marginTop: 24,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  devTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  devText: {
    fontSize: 12,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
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
    backgroundColor: '#374151',
  },
  pdfViewer: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  modalFooter: {
    padding: 16,
    borderTopWidth: 1,
  },
  rotateModalButton: {
    backgroundColor: '#4b5563',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  rotateModalButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  applyModalButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  applyModalButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  saveModalButton: {
    backgroundColor: '#10b981',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  saveModalButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
