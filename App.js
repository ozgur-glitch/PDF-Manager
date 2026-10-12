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
import * as ImagePicker from 'expo-image-picker';
import Pdf from 'react-native-pdf';
import { StatusBar } from 'expo-status-bar';
import { PDFDocument, degrees } from 'pdf-lib';

const STORAGE_KEY = '@pdf_manager_files';
const THEME_KEY = '@pdf_manager_theme';

export default function App() {
  const [pdfs, setPdfs] = useState([]);
  const [previewItem, setPreviewItem] = useState(null);
  const [totalPages, setTotalPages] = useState(1);

  // Markierte Seiten im Vorschaumodus (Array von Seitennummern: [1, 3, 5])
  const [selectedPages, setSelectedPages] = useState([]);

  // Darkmode & Sortierung
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [sortBy, setSortBy] = useState('newest');

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
      if (theme !== null) setIsDarkMode(theme === 'dark');
    } catch (error) {}
  };

  const toggleTheme = async (val) => {
    setIsDarkMode(val);
    try {
      await AsyncStorage.setItem(THEME_KEY, val ? 'dark' : 'light');
    } catch (error) {}
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
        multiple: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const now = new Date();
        const dateStr = now.toLocaleDateString('de-DE');
        const timeStr = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

        const newFiles = result.assets.map((file) => ({
          id: Date.now().toString() + Math.random(),
          title: file.name.replace(/\.[^/.]+$/, ''),
          uri: file.uri,
          fileName: file.name,
          date: `${dateStr}, ${timeStr}`,
          timestamp: now.getTime()
        }));

        const updatedPdfs = [...newFiles, ...pdfs];
        setPdfs(updatedPdfs);
        savePdfs(updatedPdfs);
      }
    } catch (error) {
      Alert.alert('Fehler', 'Dateien konnten nicht ausgewählt werden.');
    }
  };

  const takePhotoAndSaveAsPdf = async () => {
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Berechtigung verfehlt', 'Kamerazugriff wird benötigt.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const imageUri = result.assets[0].uri;
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([595.28, 841.89]);
        
        const imageBytes = await FileSystem.readAsStringAsync(imageUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        
        const embeddedImage = await pdfDoc.embedJpg(imageBytes);
        const { width, height } = embeddedImage.scaleToFit(500, 750);
        
        page.drawImage(embeddedImage, {
          x: (595.28 - width) / 2,
          y: (841.89 - height) / 2,
          width,
          height,
        });

        const pdfBytes = await pdfDoc.saveAsBase64();
        const newUri = `${FileSystem.cacheDirectory}${Date.now()}_scan.pdf`;
        await FileSystem.writeAsStringAsync(newUri, pdfBytes, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const now = new Date();
        const newScanItem = {
          id: Date.now().toString(),
          title: `Scan_${now.toLocaleDateString('de-DE')}_${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`,
          uri: newUri,
          fileName: 'dokument_scan.pdf',
          date: `${now.toLocaleDateString('de-DE')}, ${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`,
          timestamp: now.getTime()
        };

        const updatedPdfs = [newScanItem, ...pdfs];
        setPdfs(updatedPdfs);
        savePdfs(updatedPdfs);
        Alert.alert('Erfolg', 'Foto wurde erfolgreich als PDF gespeichert!');
      }
    } catch (error) {
      Alert.alert('Fehler', 'Kamera-Scan fehlgeschlagen.');
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

  const openPreview = async (item) => {
    try {
      const fileBytes = await FileSystem.readAsStringAsync(item.uri, { encoding: FileSystem.EncodingType.Base64 });
      const pdfDoc = await PDFDocument.load(fileBytes);
      setTotalPages(pdfDoc.getPageCount());
    } catch (e) {
      setTotalPages(1);
    }
    setPreviewItem(item);
    setSelectedPages([]);
  };

  const togglePageSelection = (pageNum) => {
    if (selectedPages.includes(pageNum)) {
      setSelectedPages(selectedPages.filter((p) => p !== pageNum));
    } else {
      setSelectedPages([...selectedPages, pageNum].sort((a, b) => a - b));
    }
  };

  const selectAllPages = () => {
    if (selectedPages.length === totalPages) {
      setSelectedPages([]);
    } else {
      const all = Array.from({ length: totalPages }, (_, i) => i + 1);
      setSelectedPages(all);
    }
  };

  // Drehen (Links / Rechts) - für markierte Seiten oder alle Seiten
  const rotateSelectedPages = async (direction) => {
    if (!previewItem) return;
    const pagesToRotate = selectedPages.length > 0 
      ? selectedPages 
      : Array.from({ length: totalPages }, (_, i) => i + 1);

    const delta = direction === 'left' ? -90 : 90;

    try {
      const fileBytes = await FileSystem.readAsStringAsync(previewItem.uri, { encoding: FileSystem.EncodingType.Base64 });
      const pdfDoc = await PDFDocument.load(fileBytes);
      const allPages = pdfDoc.getPages();

      pagesToRotate.forEach((pageNum) => {
        const page = allPages[pageNum - 1];
        if (page) {
          const currentRotation = page.getRotation().angle;
          const newRotation = (currentRotation + delta + 360) % 360;
          page.setRotation(degrees(newRotation));
        }
      });

      const savedBytes = await pdfDoc.saveAsBase64();
      const newUri = `${FileSystem.cacheDirectory}${Date.now()}_rotated.pdf`;
      await FileSystem.writeAsStringAsync(newUri, savedBytes, { encoding: FileSystem.EncodingType.Base64 });

      setPreviewItem({ ...previewItem, uri: newUri });
    } catch (err) {
      Alert.alert('Fehler', 'Drehen fehlgeschlagen.');
    }
  };

  // Markierte Seiten löschen
  const deleteSelectedPages = async () => {
    if (!previewItem) return;
    if (selectedPages.length === 0) {
      Alert.alert('Hinweis', 'Bitte markiere zuerst mindestens eine Seite.');
      return;
    }
    if (selectedPages.length >= totalPages) {
      Alert.alert('Fehler', 'Es müssen mindestens 1 Seite im Dokument erhalten bleiben.');
      return;
    }

    try {
      const fileBytes = await FileSystem.readAsStringAsync(previewItem.uri, { encoding: FileSystem.EncodingType.Base64 });
      const pdfDoc = await PDFDocument.load(fileBytes);

      // Rückwärts löschen, damit sich die Indizes beim Löschen nicht verschieben
      const sortedDesc = [...selectedPages].sort((a, b) => b - a);
      sortedDesc.forEach((pageNum) => {
        pdfDoc.removePage(pageNum - 1);
      });

      const savedBytes = await pdfDoc.saveAsBase64();
      const newUri = `${FileSystem.cacheDirectory}${Date.now()}_pages_deleted.pdf`;
      await FileSystem.writeAsStringAsync(newUri, savedBytes, { encoding: FileSystem.EncodingType.Base64 });

      const newTotal = totalPages - selectedPages.length;
      setTotalPages(newTotal);
      setSelectedPages([]);
      setPreviewItem({ ...previewItem, uri: newUri });
      Alert.alert('Erfolg', 'Markierte Seiten wurden gelöscht.');
    } catch (err) {
      Alert.alert('Fehler', 'Löschen der Seiten fehlgeschlagen.');
    }
  };

  // Markierte Seiten verschieben (Richtung -1 = nach oben/links, +1 = nach unten/rechts)
  const moveSelectedPages = async (direction) => {
    if (!previewItem) return;
    if (selectedPages.length === 0) {
      Alert.alert('Hinweis', 'Bitte markiere eine Seite zum Verschieben.');
      return;
    }

    try {
      const fileBytes = await FileSystem.readAsStringAsync(previewItem.uri, { encoding: FileSystem.EncodingType.Base64 });
      const pdfDoc = await PDFDocument.load(fileBytes);
      const pageCount = pdfDoc.getPageCount();
      const indices = pdfDoc.getPageIndices();

      let targetSelected = [...selectedPages];
      let canMove = true;

      if (direction === -1) {
        if (targetSelected[0] <= 1) canMove = false;
      } else {
        if (targetSelected[targetSelected.length - 1] >= pageCount) canMove = false;
      }

      if (!canMove) {
        Alert.alert('Hinweis', 'Verschieben in diese Richtung nicht weiter möglich.');
        return;
      }

      // Verschiebe-Index-Array anpassen
      if (direction === -1) {
        for (let pageNum of targetSelected) {
          const idx = pageNum - 1;
          const temp = indices[idx];
          indices[idx] = indices[idx - 1];
          indices[idx - 1] = temp;
        }
      } else {
        for (let i = targetSelected.length - 1; i >= 0; i--) {
          const pageNum = targetSelected[i];
          const idx = pageNum - 1;
          const temp = indices[idx];
          indices[idx] = indices[idx + 1];
          indices[idx + 1] = temp;
        }
      }

      const newPdf = await PDFDocument.create();
      const copiedPages = await newPdf.copyPages(pdfDoc, indices);
      copiedPages.forEach((p) => newPdf.addPage(p));

      const savedBytes = await newPdf.saveAsBase64();
      const newUri = `${FileSystem.cacheDirectory}${Date.now()}_moved.pdf`;
      await FileSystem.writeAsStringAsync(newUri, savedBytes, { encoding: FileSystem.EncodingType.Base64 });

      const newSelected = targetSelected.map((p) => p + direction);
      setSelectedPages(newSelected);
      setPreviewItem({ ...previewItem, uri: newUri });
    } catch (err) {
      Alert.alert('Fehler', 'Verschieben fehlgeschlagen.');
    }
  };

  const saveRotatedChanges = () => {
    if (!previewItem) return;
    const updatedPdfs = pdfs.map((p) => (p.id === previewItem.id ? previewItem : p));
    setPdfs(updatedPdfs);
    savePdfs(updatedPdfs);
    Alert.alert('Gespeichert', 'Die Änderungen wurden in der Liste übernommen.');
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
          const fileBytes = await FileSystem.readAsStringAsync(item.uri, { encoding: FileSystem.EncodingType.Base64 });
          const donorPdf = await PDFDocument.load(fileBytes);
          const copiedPages = await mergedPdf.copyPages(donorPdf, donorPdf.getPageIndices());
          copiedPages.forEach((page) => mergedPdf.addPage(page));
        }
      }

      const mergedPdfBytes = await mergedPdf.saveAsBase64();
      const newUri = `${FileSystem.cacheDirectory}${Date.now()}_merged.pdf`;
      await FileSystem.writeAsStringAsync(newUri, mergedPdfBytes, { encoding: FileSystem.EncodingType.Base64 });

      const now = new Date();
      const newMergedItem = {
        id: Date.now().toString(),
        title: `Zusammengeführt_${selectedForMerge.length}_Dateien`,
        uri: newUri,
        fileName: 'zusammengefuegt.pdf',
        date: `${now.toLocaleDateString('de-DE')}, ${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`,
        timestamp: now.getTime()
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

  const deleteAllPdfs = () => {
    if (pdfs.length === 0) return;
    Alert.alert('Alle löschen', 'Möchtest du wirklich ALLE gespeicherten PDFs löschen?', [
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
    ]);
  };

  const sortedPdfs = [...pdfs].sort((a, b) => {
    if (sortBy === 'newest') return (b.timestamp || 0) - (a.timestamp || 0);
    if (sortBy === 'oldest') return (a.timestamp || 0) - (b.timestamp || 0);
    if (sortBy === 'alpha') return a.title.localeCompare(b.title);
    return 0;
  });

  const currentStyles = isDarkMode ? darkStyles : lightStyles;

  return (
    <SafeAreaView style={[styles.container, currentStyles.container]}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📄 PDF-Manager Pro</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Dark Mode Switch */}
        <View style={[styles.cardRow, currentStyles.card]}>
          <Text style={[styles.rowText, currentStyles.text]}>🌙 Dunkler Modus</Text>
          <Switch value={isDarkMode} onValueChange={toggleTheme} />
        </View>

        {/* Datei hinzufügen & Kamera */}
        <View style={styles.buttonRow}>
          <TouchableOpacity style={[styles.pickerButton, { flex: 1, marginRight: 6 }]} onPress={pickDocument}>
            <Text style={styles.pickerButtonText}>📂 PDF wählen</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.pickerButton, { flex: 1, marginLeft: 6, backgroundColor: '#059669' }]} onPress={takePhotoAndSaveAsPdf}>
            <Text style={styles.pickerButtonText}>📷 Foto-Scan</Text>
          </TouchableOpacity>
        </View>

        {/* Sortier-Buttons */}
        <View style={[styles.sortContainer, currentStyles.card]}>
          <Text style={[styles.sortLabel, currentStyles.text]}>Sortierung:</Text>
          <View style={styles.sortButtonsRow}>
            <TouchableOpacity style={[styles.sortBtn, sortBy === 'newest' && styles.sortBtnActive]} onPress={() => setSortBy('newest')}>
              <Text style={[styles.sortBtnText, sortBy === 'newest' && styles.sortBtnTextActive]}>Neueste</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.sortBtn, sortBy === 'oldest' && styles.sortBtnActive]} onPress={() => setSortBy('oldest')}>
              <Text style={[styles.sortBtnText, sortBy === 'oldest' && styles.sortBtnTextActive]}>Älteste</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.sortBtn, sortBy === 'alpha' && styles.sortBtnActive]} onPress={() => setSortBy('alpha')}>
              <Text style={[styles.sortBtnText, sortBy === 'alpha' && styles.sortBtnTextActive]}>A-Z</Text>
            </TouchableOpacity>
          </View>
        </View>

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
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#10b981', marginBottom: 12 }]} onPress={executeMerge}>
            <Text style={styles.actionBtnText}>🔗 Ausgewählte ({selectedForMerge.length}) zusammenführen</Text>
          </TouchableOpacity>
        )}

        <View style={styles.listHeaderRow}>
          <Text style={[styles.listHeading, currentStyles.subText]}>Dokumente ({sortedPdfs.length}):</Text>
          {sortedPdfs.length > 0 && (
            <TouchableOpacity onPress={deleteAllPdfs} style={styles.deleteAllBtn}>
              <Text style={styles.deleteAllBtnText}>🗑️ Alle löschen</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* PDF Liste */}
        {sortedPdfs.map((item) => {
          const isSelected = selectedForMerge.includes(item.id);
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.pdfCard, currentStyles.card, isSelected && styles.pdfCardSelected]}
              onPress={() => {
                if (isMergingMode) toggleSelectForMerge(item.id);
                else openPreview(item);
              }}
            >
              <View style={styles.pdfInfo}>
                <Text style={[styles.pdfTitle, currentStyles.text]} numberOfLines={1}>{item.title}</Text>
                <Text style={[styles.dateText, currentStyles.subText]}>{item.date}</Text>
              </View>

              {!isMergingMode && (
                <View style={styles.actionButtons} onStartShouldSetResponder={() => true}>
                  <TouchableOpacity style={styles.iconButton} onPress={() => savePdfToDeviceFolder(item)}>
                    <Text style={styles.iconText}>💾</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.deleteButton} onPress={() => deletePdf(item.id)}>
                    <Text style={styles.deleteButtonText}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        {sortedPdfs.length === 0 && (
          <Text style={[styles.emptyText, currentStyles.subText]}>Noch keine PDFs vorhanden.</Text>
        )}

        {/* Entwicklerinfo */}
        <View style={[styles.developerCard, currentStyles.card]}>
          <Text style={[styles.devTitle, currentStyles.text]}>👨‍💻 Entwicklerinfo</Text>
          <Text style={[styles.devText, currentStyles.subText]}>Entwickler: Özgür Cetin</Text>
          <Text style={[styles.devText, currentStyles.subText]}>E-Mail: ozgur.cetin@web.de</Text>
        </View>
      </ScrollView>

      {/* VORSCHAU & SEITEN-BEARBEITUNGS-MODAL */}
      <Modal visible={previewItem !== null} animationType="slide" transparent={false}>
        <SafeAreaView style={[styles.modalContainer, currentStyles.container]}>
          <View style={[styles.modalHeader, currentStyles.modalHeader]}>
            <Text style={[styles.modalTitle, currentStyles.text]} numberOfLines={1}>{previewItem?.title}</Text>
            <TouchableOpacity style={styles.closeTopButton} onPress={() => setPreviewItem(null)}>
              <Text style={styles.closeTopButtonText}>✕ Schließen</Text>
            </TouchableOpacity>
          </View>

          {/* Seiten-Markierungsauswahl */}
          <View style={styles.pageSelectionHeader}>
            <Text style={styles.pageSelectionText}>
              Seiten markieren ({selectedPages.length}/{totalPages}):
            </Text>
            <TouchableOpacity style={styles.selectAllBtn} onPress={selectAllPages}>
              <Text style={styles.selectAllBtnText}>
                {selectedPages.length === totalPages ? 'Keine' : 'Alle markieren'}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pagePillsScrollView}>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
              const isSelected = selectedPages.includes(pageNum);
              return (
                <TouchableOpacity
                  key={pageNum}
                  style={[styles.pagePill, isSelected && styles.pagePillSelected]}
                  onPress={() => togglePageSelection(pageNum)}
                >
                  <Text style={[styles.pagePillText, isSelected && styles.pagePillTextSelected]}>
                    S. {pageNum}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.pdfViewerContainer}>
            {previewItem && (
              <Pdf
                trustAllCerts={false}
                source={{ uri: previewItem.uri, cache: true }}
                style={styles.pdfViewer}
              />
            )}
          </View>

          {/* Steuerung & Bearbeitung unten */}
          <View style={[styles.modalFooter, currentStyles.modalFooter]}>
            {/* Drehen-Buttons */}
            <View style={styles.inlineRow}>
              <TouchableOpacity style={[styles.rotateBtn, { marginRight: 4 }]} onPress={() => rotateSelectedPages('left')}>
                <Text style={styles.rotateBtnText}>↺ 90° Links</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.rotateBtn, { marginLeft: 4 }]} onPress={() => rotateSelectedPages('right')}>
                <Text style={styles.rotateBtnText}>↻ 90° Rechts</Text>
              </TouchableOpacity>
            </View>

            {/* Verschieben & Löschen der markierten Seiten */}
            <View style={[styles.inlineRow, { marginTop: 6 }]}>
              <TouchableOpacity style={[styles.miniBtnBlue, { flex: 1, marginRight: 4 }]} onPress={() => moveSelectedPages(-1)}>
                <Text style={styles.miniBtnText}>◀ Nach vorne</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.miniBtnBlue, { flex: 1, marginHorizontal: 4 }]} onPress={() => moveSelectedPages(1)}>
                <Text style={styles.miniBtnText}>Nach hinten ▶</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.miniBtnRed, { flex: 1, marginLeft: 4 }]} onPress={deleteSelectedPages}>
                <Text style={styles.miniBtnText}>🗑️ Löschen</Text>
              </TouchableOpacity>
            </View>

            {/* Speichern in App & Handy */}
            <View style={[styles.inlineRow, { marginTop: 8 }]}>
              <TouchableOpacity style={[styles.applyModalButton, { flex: 1, marginRight: 4 }]} onPress={saveRotatedChanges}>
                <Text style={styles.applyModalButtonText}>✔️ In Liste übernehmen</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.saveModalButton, { flex: 1, marginLeft: 4 }]} onPress={() => savePdfToDeviceFolder(previewItem)}>
                <Text style={styles.saveModalButtonText}>💾 Auf Handy speichern</Text>
              </TouchableOpacity>
            </View>
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
  container: { flex: 1 },
  header: { backgroundColor: '#2563eb', paddingVertical: 18, alignItems: 'center' },
  headerTitle: { color: '#ffffff', fontSize: 20, fontWeight: 'bold' },
  content: { padding: 16 },
  cardRow: { padding: 12, borderRadius: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderWidth: 1 },
  rowText: { fontSize: 14, fontWeight: '600' },
  buttonRow: { flexDirection: 'row', marginBottom: 12 },
  pickerButton: { backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  pickerButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  sortContainer: { padding: 10, borderRadius: 8, marginBottom: 12, borderWidth: 1 },
  sortLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  sortButtonsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  sortBtn: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6, marginHorizontal: 2, backgroundColor: '#e5e7eb' },
  sortBtnActive: { backgroundColor: '#2563eb' },
  sortBtnText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  sortBtnTextActive: { color: '#ffffff' },
  actionBtn: { borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  actionBtnText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  listHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  listHeading: { fontSize: 14, fontWeight: '600' },
  deleteAllBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  deleteAllBtnText: { color: '#ef4444', fontSize: 13, fontWeight: '600' },
  pdfCard: { borderRadius: 8, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
  pdfCardSelected: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  pdfInfo: { flex: 1, marginRight: 6 },
  pdfTitle: { fontSize: 14, fontWeight: '600' },
  dateText: { fontSize: 11, marginTop: 2 },
  actionButtons: { flexDirection: 'row', alignItems: 'center' },
  iconButton: { padding: 6, marginRight: 4 },
  iconText: { fontSize: 18 },
  deleteButton: { padding: 6 },
  deleteButtonText: { fontSize: 18, color: '#ef4444', fontWeight: 'bold' },
  emptyText: { textAlign: 'center', marginTop: 20, fontStyle: 'italic' },
  developerCard: { marginTop: 24, padding: 14, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  devTitle: { fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
  devText: { fontSize: 12 },
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  modalTitle: { fontSize: 16, fontWeight: 'bold', flex: 1, marginRight: 10 },
  closeTopButton: { padding: 6 },
  closeTopButtonText: { fontSize: 14, fontWeight: '600', color: '#ef4444' },
  pageSelectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, backgroundColor: '#374151' },
  pageSelectionText: { color: '#ffffff', fontSize: 12, fontWeight: '600' },
  selectAllBtn: { paddingVertical: 2, paddingHorizontal: 8, backgroundColor: '#4b5563', borderRadius: 4 },
  selectAllBtnText: { color: '#ffffff', fontSize: 11 },
  pagePillsScrollView: { backgroundColor: '#374151', paddingHorizontal: 12, paddingVertical: 8, maxHeight: 46 },
  pagePill: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12, backgroundColor: '#4b5563', marginRight: 6, height: 28 },
  pagePillSelected: { backgroundColor: '#2563eb' },
  pagePillText: { color: '#d1d5db', fontSize: 12, fontWeight: '600' },
  pagePillTextSelected: { color: '#ffffff' },
  pdfViewerContainer: { flex: 1, backgroundColor: '#111827' },
  pdfViewer: { flex: 1, width: '100%', height: '100%' },
  modalFooter: { padding: 12, borderTopWidth: 1 },
  rotateBtn: { flex: 1, backgroundColor: '#4b5563', borderRadius: 6, paddingVertical: 8, alignItems: 'center' },
  rotateBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '600' },
  applyModalButton: { backgroundColor: '#2563eb', borderRadius: 6, paddingVertical: 10, alignItems: 'center' },
  applyModalButtonText: { color: '#ffffff', fontSize: 13, fontWeight: '600' },
  saveModalButton: { backgroundColor: '#10b981', borderRadius: 6, paddingVertical: 10, alignItems: 'center' },
  saveModalButtonText: { color: '#ffffff', fontSize: 13, fontWeight: '600' },
  inlineRow: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  miniBtnRed: { backgroundColor: '#ef4444', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 6, alignItems: 'center' },
  miniBtnBlue: { backgroundColor: '#2563eb', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 6, alignItems: 'center' },
  miniBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '600' },
});
