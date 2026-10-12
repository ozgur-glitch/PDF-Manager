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
  Switch,
  TextInput
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import Pdf from 'react-native-pdf';
import { StatusBar } from 'expo-status-bar';
import { PDFDocument, degrees, rgb } from 'pdf-lib';

const STORAGE_KEY = '@pdf_manager_files';
const THEME_KEY = '@pdf_manager_theme';

export default function App() {
  const [pdfs, setPdfs] = useState([]);
  const [previewItem, setPreviewItem] = useState(null);
  const [currentRotation, setCurrentRotation] = useState(0);

  // Darkmode & Sortierung
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [sortBy, setSortBy] = useState('newest'); // 'newest', 'oldest', 'alpha'

  // Multi-Select / Merge State
  const [isMergingMode, setIsMergingMode] = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState([]);

  // Editor State für Seitenoperationen im Vorschaumodus
  const [activeTab, setActiveTab] = useState('view'); // 'view', 'edit', 'extract', 'stamp'
  const [targetPage, setTargetPage] = useState('1');
  const [extractStart, setExtractStart] = useState('1');
  const [extractEnd, setExtractEnd] = useState('1');
  const [stampText, setStampText] = useState('');

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

  // Dokumente auswählen (PDFs)
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

  // Foto aufnehmen & als PDF speichern
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
        
        // Bild in PDF konvertieren mit pdf-lib
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([595.28, 841.89]); // A4 Format
        
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

  const openPreview = (item) => {
    setPreviewItem(item);
    setCurrentRotation(0);
    setActiveTab('view');
  };

  // 1. Drehen
  const rotateInPreview = async () => {
    if (!previewItem) return;
    try {
      const nextRot = (currentRotation + 90) % 360;
      setCurrentRotation(nextRot);

      const fileBytes = await FileSystem.readAsStringAsync(previewItem.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const pdfDoc = await PDFDocument.load(fileBytes);
      pdfDoc.getPages().forEach((page) => page.setRotation(degrees(nextRot)));

      const modifiedPdfBytes = await pdfDoc.saveAsBase64();
      const newUri = `${FileSystem.cacheDirectory}${Date.now()}_rotated.pdf`;
      await FileSystem.writeAsStringAsync(newUri, modifiedPdfBytes, { encoding: FileSystem.EncodingType.Base64 });

      setPreviewItem({ ...previewItem, uri: newUri });
    } catch (error) {
      Alert.alert('Fehler', 'Drehen fehlgeschlagen.');
    }
  };

  // 2. Einzelne Seite löschen
  const deletePage = async () => {
    if (!previewItem) return;
    const pageNum = parseInt(targetPage, 10);
    try {
      const fileBytes = await FileSystem.readAsStringAsync(previewItem.uri, { encoding: FileSystem.EncodingType.Base64 });
      const pdfDoc = await PDFDocument.load(fileBytes);
      const totalPages = pdfDoc.getPageCount();

      if (isNaN(pageNum) || pageNum < 1 || pageNum > totalPages) {
        Alert.alert('Fehler', `Ungültige Seitenzahl (1 - ${totalPages}).`);
        return;
      }
      if (totalPages <= 1) {
        Alert.alert('Fehler', 'Das Dokument hat nur eine Seite und kann nicht geleert werden.');
        return;
      }

      pdfDoc.removePage(pageNum - 1);
      const savedBytes = await pdfDoc.saveAsBase64();
      const newUri = `${FileSystem.cacheDirectory}${Date.now()}_page_removed.pdf`;
      await FileSystem.writeAsStringAsync(newUri, savedBytes, { encoding: FileSystem.EncodingType.Base64 });

      setPreviewItem({ ...previewItem, uri: newUri });
      Alert.alert('Erfolg', `Seite ${pageNum} wurde entfernt.`);
    } catch (err) {
      Alert.alert('Fehler', 'Seitenlöschung fehlgeschlagen.');
    }
  };

  // 3. Seiten verschieben (Pfeil-Buttons: Richtung = -1 oder +1)
  const movePage = async (direction) => {
    if (!previewItem) return;
    const pageNum = parseInt(targetPage, 10);
    try {
      const fileBytes = await FileSystem.readAsStringAsync(previewItem.uri, { encoding: FileSystem.EncodingType.Base64 });
      const pdfDoc = await PDFDocument.load(fileBytes);
      const totalPages = pdfDoc.getPageCount();
      const srcIndex = pageNum - 1;
      const destIndex = srcIndex + direction;

      if (isNaN(pageNum) || srcIndex < 0 || srcIndex >= totalPages || destIndex < 0 || destIndex >= totalPages) {
        Alert.alert('Hinweis', 'Seitenverschiebung in diese Richtung nicht möglich.');
        return;
      }

      const indices = pdfDoc.getPageIndices();
      // Umsortieren des Arrays
      const [moved] = indices.splice(srcIndex, 1);
      indices.splice(destIndex, 0, moved);

      const newPdf = await PDFDocument.create();
      const copiedPages = await newPdf.copyPages(pdfDoc, indices);
      copiedPages.forEach((p) => newPdf.addPage(p));

      const savedBytes = await newPdf.saveAsBase64();
      const newUri = `${FileSystem.cacheDirectory}${Date.now()}_reordered.pdf`;
      await FileSystem.writeAsStringAsync(newUri, savedBytes, { encoding: FileSystem.EncodingType.Base64 });

      setPreviewItem({ ...previewItem, uri: newUri });
      setTargetPage((destIndex + 1).toString());
      Alert.alert('Erfolg', `Seite ${srcIndex + 1} verschoben nach Position ${destIndex + 1}.`);
    } catch (err) {
      Alert.alert('Fehler', 'Verschieben fehlgeschlagen.');
    }
  };

  // 4. Seiten extrahieren
  const extractPages = async () => {
    if (!previewItem) return;
    const start = parseInt(extractStart, 10);
    const end = parseInt(extractEnd, 10);
    try {
      const fileBytes = await FileSystem.readAsStringAsync(previewItem.uri, { encoding: FileSystem.EncodingType.Base64 });
      const pdfDoc = await PDFDocument.load(fileBytes);
      const totalPages = pdfDoc.getPageCount();

      if (isNaN(start) || isNaN(end) || start < 1 || end > totalPages || start > end) {
        Alert.alert('Fehler', `Ungültiger Bereich (1 - ${totalPages}).`);
        return;
      }

      const newPdf = await PDFDocument.create();
      const rangeIndices = [];
      for (let i = start - 1; i <= end - 1; i++) rangeIndices.push(i);

      const copiedPages = await newPdf.copyPages(pdfDoc, rangeIndices);
      copiedPages.forEach((p) => newPdf.addPage(p));

      const savedBytes = await newPdf.saveAsBase64();
      const newUri = `${FileSystem.cacheDirectory}${Date.now()}_extracted.pdf`;
      await FileSystem.writeAsStringAsync(newUri, savedBytes, { encoding: FileSystem.EncodingType.Base64 });

      const now = new Date();
      const extractedItem = {
        id: Date.now().toString(),
        title: `${previewItem.title} (Seiten ${start}-${end})`,
        uri: newUri,
        fileName: 'extrahiert.pdf',
        date: `${now.toLocaleDateString('de-DE')}, ${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`,
        timestamp: now.getTime()
      };

      const updated = [extractedItem, ...pdfs];
      setPdfs(updated);
      savePdfs(updated);
      Alert.alert('Erfolg', 'Seitenbereich als neues Dokument extrahiert!');
    } catch (err) {
      Alert.alert('Fehler', 'Extrahieren fehlgeschlagen.');
    }
  };

  // 5. Dateigröße optimieren (Komprimieren)
  const optimizePdfSize = async () => {
    if (!previewItem) return;
    try {
      const fileBytes = await FileSystem.readAsStringAsync(previewItem.uri, { encoding: FileSystem.EncodingType.Base64 });
      const pdfDoc = await PDFDocument.load(fileBytes);
      const optimizedBytes = await pdfDoc.save({ useObjectStreams: true });
      const base64Data = Buffer.from(optimizedBytes).toString('base64');

      const newUri = `${FileSystem.cacheDirectory}${Date.now()}_optimized.pdf`;
      await FileSystem.writeAsStringAsync(newUri, base64Data, { encoding: FileSystem.EncodingType.Base64 });

      setPreviewItem({ ...previewItem, uri: newUri });
      Alert.alert('Optimiert', 'Die PDF-Struktur wurde komprimiert.');
    } catch (err) {
      Alert.alert('Fehler', 'Optimierung fehlgeschlagen.');
    }
  };

  // 6. Text / Aufnahmedatum stempeln
  const addTextStamp = async () => {
    if (!previewItem || !stampText.trim()) {
      Alert.alert('Hinweis', 'Bitte Text eingeben.');
      return;
    }
    const pageNum = parseInt(targetPage, 10);
    try {
      const fileBytes = await FileSystem.readAsStringAsync(previewItem.uri, { encoding: FileSystem.EncodingType.Base64 });
      const pdfDoc = await PDFDocument.load(fileBytes);
      const totalPages = pdfDoc.getPageCount();

      if (isNaN(pageNum) || pageNum < 1 || pageNum > totalPages) {
        Alert.alert('Fehler', 'Ungültige Seitenzahl.');
        return;
      }

      const page = pdfDoc.getPage(pageNum - 1);
      page.drawText(stampText, {
        x: 50,
        y: 50,
        size: 16,
        color: rgb(0.8, 0.1, 0.1),
      });

      const savedBytes = await pdfDoc.saveAsBase64();
      const newUri = `${FileSystem.cacheDirectory}${Date.now()}_stamped.pdf`;
      await FileSystem.writeAsStringAsync(newUri, savedBytes, { encoding: FileSystem.EncodingType.Base64 });

      setPreviewItem({ ...previewItem, uri: newUri });
      setStampText('');
      Alert.alert('Erfolg', 'Text-Stempel eingefügt.');
    } catch (err) {
      Alert.alert('Fehler', 'Stempeln fehlgeschlagen.');
    }
  };

  const saveRotatedChanges = () => {
    if (!previewItem) return;
    const updatedPdfs = pdfs.map((p) => (p.id === previewItem.id ? previewItem : p));
    setPdfs(updatedPdfs);
    savePdfs(updatedPdfs);
    Alert.alert('Gespeichert', 'Die Änderungen wurden dauerhaft in der Liste übernommen.');
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

  // Sortierte Liste berechnen
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

      {/* VORSCHAU & PROFESSOR-EDITOR MODAL */}
      <Modal visible={previewItem !== null} animationType="slide" transparent={false}>
        <SafeAreaView style={[styles.modalContainer, currentStyles.container]}>
          <View style={[styles.modalHeader, currentStyles.modalHeader]}>
            <Text style={[styles.modalTitle, currentStyles.text]} numberOfLines={1}>{previewItem?.title}</Text>
            <TouchableOpacity style={styles.closeTopButton} onPress={() => setPreviewItem(null)}>
              <Text style={styles.closeTopButtonText}>✕ Schließen</Text>
            </TouchableOpacity>
          </View>

          {/* Sub-Tabs im Modal */}
          <View style={styles.modalSubTabs}>
            <TouchableOpacity style={[styles.subTabBtn, activeTab === 'view' && styles.subTabActive]} onPress={() => setActiveTab('view')}>
              <Text style={styles.subTabText}>Ansicht</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.subTabBtn, activeTab === 'edit' && styles.subTabActive]} onPress={() => setActiveTab('edit')}>
              <Text style={styles.subTabText}>Seiten</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.subTabBtn, activeTab === 'extract' && styles.subTabActive]} onPress={() => setActiveTab('extract')}>
              <Text style={styles.subTabText}>Extrahieren</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.subTabBtn, activeTab === 'stamp' && styles.subTabActive]} onPress={() => setActiveTab('stamp')}>
              <Text style={styles.subTabText}>Stempel</Text>
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

          {/* Dynamische Toolbar unten je nach Tab */}
          <View style={[styles.modalFooter, currentStyles.modalFooter]}>
            {activeTab === 'view' && (
              <>
                <TouchableOpacity style={styles.rotateModalButton} onPress={rotateInPreview}>
                  <Text style={styles.rotateModalButtonText}>🔄 90° Drehen ({currentRotation}°)</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.applyModalButton} onPress={saveRotatedChanges}>
                  <Text style={styles.applyModalButtonText}>✔️ In Liste übernehmen</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveModalButton} onPress={() => savePdfToDeviceFolder(previewItem)}>
                  <Text style={styles.saveModalButtonText}>💾 Auf Handy speichern</Text>
                </TouchableOpacity>
              </>
            )}

            {activeTab === 'edit' && (
              <View style={{ width: '100%' }}>
                <View style={styles.inlineRow}>
                  <Text style={[styles.labelSmall, currentStyles.text]}>Ziel-Seite:</Text>
                  <TextInput
                    style={[styles.inputSmall, currentStyles.card, currentStyles.text]}
                    value={targetPage}
                    onChangeText={setTargetPage}
                    keyboardType="numeric"
                  />
                  <TouchableOpacity style={styles.miniBtnRed} onPress={deletePage}>
                    <Text style={styles.miniBtnText}>Seiten-Löschen</Text>
                  </TouchableOpacity>
                </View>
                <View style={[styles.inlineRow, { marginTop: 6 }]}>
                  <TouchableOpacity style={[styles.miniBtnBlue, { flex: 1, marginRight: 4 }]} onPress={() => movePage(-1)}>
                    <Text style={styles.miniBtnText}>◀ Seite nach links/oben</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.miniBtnBlue, { flex: 1, marginLeft: 4 }]} onPress={() => movePage(1)}>
                    <Text style={styles.miniBtnText}>Seite nach rechts/unten ▶</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {activeTab === 'extract' && (
              <View style={{ width: '100%' }}>
                <View style={styles.inlineRow}>
                  <Text style={[styles.labelSmall, currentStyles.text]}>Von:</Text>
                  <TextInput style={[styles.inputSmall, currentStyles.card, currentStyles.text]} value={extractStart} onChangeText={setExtractStart} keyboardType="numeric" />
                  <Text style={[styles.labelSmall, currentStyles.text, { marginLeft: 10 }]}>Bis:</Text>
                  <TextInput style={[styles.inputSmall, currentStyles.card, currentStyles.text]} value={extractEnd} onChangeText={setExtractEnd} keyboardType="numeric" />
                </View>
                <TouchableOpacity style={[styles.applyModalButton, { marginTop: 6 }]} onPress={extractPages}>
                  <Text style={styles.applyModalButtonText}>✂️ Seitenbereich extrahieren</Text>
                </TouchableOpacity>
              </View>
            )}

            {activeTab === 'stamp' && (
              <View style={{ width: '100%' }}>
                <View style={styles.inlineRow}>
                  <TextInput
                    style={[styles.inputLarge, currentStyles.card, currentStyles.text]}
                    placeholder="Text / Datum eingeben..."
                    placeholderTextColor="#9ca3af"
                    value={stampText}
                    onChangeText={setStampText}
                  />
                  <TouchableOpacity style={styles.miniBtnGreen} onPress={addTextStamp}>
                    <Text style={styles.miniBtnText}>Stempeln</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={[styles.rotateModalButton, { marginTop: 6 }]} onPress={optimizePdfSize}>
                  <Text style={styles.rotateModalButtonText}>🗜️ Dateigröße komprimieren</Text>
                </TouchableOpacity>
              </View>
            )}
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
  modalSubTabs: { flexDirection: 'row', backgroundColor: '#374151' },
  subTabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  subTabActive: { backgroundColor: '#2563eb' },
  subTabText: { color: '#ffffff', fontSize: 13, fontWeight: '600' },
  pdfViewerContainer: { flex: 1, backgroundColor: '#374151' },
  pdfViewer: { flex: 1, width: '100%', height: '100%' },
  modalFooter: { padding: 12, borderTopWidth: 1 },
  rotateModalButton: { backgroundColor: '#4b5563', borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginBottom: 6 },
  rotateModalButtonText: { color: '#ffffff', fontSize: 13, fontWeight: '600' },
  applyModalButton: { backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginBottom: 6 },
  applyModalButtonText: { color: '#ffffff', fontSize: 13, fontWeight: '600' },
  saveModalButton: { backgroundColor: '#10b981', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  saveModalButtonText: { color: '#ffffff', fontSize: 13, fontWeight: '600' },
  inlineRow: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  labelSmall: { fontSize: 13, fontWeight: '600', marginRight: 6 },
  inputSmall: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, width: 60, textAlign: 'center', marginRight: 10 },
  inputLarge: { flex: 1, borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, marginRight: 8, fontSize: 13 },
  miniBtnRed: { backgroundColor: '#ef4444', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6 },
  miniBtnBlue: { backgroundColor: '#2563eb', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 6, alignItems: 'center' },
  miniBtnGreen: { backgroundColor: '#10b981', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6 },
  miniBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '600' },
});
