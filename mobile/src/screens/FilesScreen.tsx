import React, { useState, useEffect } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, SafeAreaView, Alert, ActivityIndicator,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import { LinearGradient } from 'expo-linear-gradient'
import { COLORS, GRAD_COLORS } from '../constants/theme'
import { api } from '../lib/api'

export default function FilesScreen() {
  const [workspace, setWorkspace] = useState<any[]>([])
  const [recent, setRecent]       = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [uploading, setUploading] = useState(false)
  const [tab, setTab]             = useState<'workspace' | 'recent'>('workspace')

  useEffect(() => { loadFiles() }, [])

  const loadFiles = async () => {
    setLoading(true)
    try {
      const { workspace: w, recent: r } = await api.files.list()
      setWorkspace(w); setRecent(r)
    } catch (e: any) { Alert.alert('Error', e.message) }
    finally { setLoading(false) }
  }

  const uploadPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    })
    if (result.canceled) return
    const asset = result.assets[0]
    await doUpload(asset.uri, asset.mimeType ?? 'image/jpeg', asset.fileName ?? 'photo.jpg')
  }

  const uploadDoc = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true })
    if (result.canceled) return
    const asset = result.assets[0]
    await doUpload(asset.uri, asset.mimeType ?? 'application/octet-stream', asset.name)
  }

  const doUpload = async (uri: string, mimeType: string, filename: string) => {
    setUploading(true)
    try {
      const { elaraNote } = await api.files.upload(uri, mimeType, filename)
      await loadFiles()
      if (elaraNote) Alert.alert('Elara', elaraNote)
    } catch (e: any) { Alert.alert('Upload failed', e.message) }
    finally { setUploading(false) }
  }

  const mimeIcon = (mime: string) => {
    if (mime?.includes('image'))        return '🖼'
    if (mime?.includes('pdf'))          return '📄'
    if (mime?.includes('sheet') || mime?.includes('csv'))     return '📊'
    if (mime?.includes('document') || mime?.includes('word')) return '📝'
    if (mime?.includes('presentation')) return '📽'
    return '📁'
  }

  const renderFile = ({ item }: { item: any }) => (
    <View style={styles.fileRow}>
      <Text style={styles.fileIcon}>{mimeIcon(item.mimeType)}</Text>
      <View style={styles.fileMeta}>
        <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.fileMime}>{item.mimeType?.split('/').pop()?.toUpperCase() ?? '—'}</Text>
      </View>
      <TouchableOpacity
        style={styles.fileBtn}
        onPress={() => Alert.alert(item.name, 'Ask Elara about this file?', [
          { text: 'Cancel' },
          { text: 'Ask Elara', onPress: async () => {
            try {
              const { response } = await api.files.ask(item.id, 'Summarize this file briefly.')
              Alert.alert('Elara', response)
            } catch (e: any) { Alert.alert('Error', e.message) }
          }},
        ])}
      >
        <Text style={styles.fileBtnText}>⬟</Text>
      </TouchableOpacity>
    </View>
  )

  return (
    <SafeAreaView style={styles.safe}>
      <LinearGradient colors={GRAD_COLORS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.topBar} />

      <View style={styles.header}>
        <Text style={styles.title}>FILES</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={uploadPhoto} disabled={uploading} style={styles.uploadBtn}>
            <Text style={styles.uploadBtnText}>{uploading ? '…' : '📷'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={uploadDoc} disabled={uploading} style={styles.uploadBtn}>
            <Text style={styles.uploadBtnText}>{uploading ? '…' : '📎'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={loadFiles} style={styles.uploadBtn}>
            <Text style={styles.uploadBtnText}>↻</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tabs}>
        {(['workspace', 'recent'] as const).map(t => (
          <TouchableOpacity key={t} onPress={() => setTab(t)} style={[styles.tabBtn, tab === t && styles.tabBtnActive]}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'workspace' ? 'MY FILES' : 'DRIVE RECENT'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.violet} />
          <Text style={styles.loadingText}>Loading files...</Text>
        </View>
      ) : (
        <FlatList
          data={tab === 'workspace' ? workspace : recent}
          keyExtractor={f => f.id}
          renderItem={renderFile}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>
                {tab === 'workspace'
                  ? 'No files yet. Tap 📷 or 📎 to upload.'
                  : 'No recent Drive files.'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: COLORS.bg },
  topBar:        { height: 2 },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: COLORS.bgDark },
  title:         { fontWeight: '900', fontSize: 18, letterSpacing: 4, color: COLORS.cyan },
  headerActions: { flexDirection: 'row', gap: 6 },
  uploadBtn:     { width: 36, height: 36, borderRadius: 6, backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  uploadBtnText: { fontSize: 18 },
  tabs:          { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.bgDark },
  tabBtn:        { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive:  { borderBottomColor: COLORS.cyan },
  tabText:       { fontFamily: 'Courier New', fontSize: 11, color: COLORS.dim, letterSpacing: 2 },
  tabTextActive: { color: COLORS.cyan },
  list:          { flex: 1 },
  listContent:   { padding: 12 },
  fileRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  fileIcon:      { fontSize: 22, width: 30, textAlign: 'center' },
  fileMeta:      { flex: 1 },
  fileName:      { color: COLORS.text, fontSize: 14, fontWeight: '600', marginBottom: 2 },
  fileMime:      { fontFamily: 'Courier New', fontSize: 10, color: COLORS.dim, letterSpacing: 1 },
  fileBtn:       { width: 30, height: 30, borderRadius: 6, backgroundColor: 'rgba(89,73,172,.1)', borderWidth: 1, borderColor: 'rgba(89,73,172,.2)', alignItems: 'center', justifyContent: 'center' },
  fileBtnText:   { color: COLORS.violet, fontSize: 14 },
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  loadingText:   { fontFamily: 'Courier New', fontSize: 12, color: COLORS.dim, marginTop: 12, letterSpacing: 2 },
  emptyText:     { fontFamily: 'Courier New', fontSize: 12, color: COLORS.dim, textAlign: 'center', lineHeight: 20, paddingHorizontal: 40 },
})
