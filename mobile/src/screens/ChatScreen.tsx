import React, { useState, useRef, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, SafeAreaView, KeyboardAvoidingView, Platform,
  Animated, Pressable, ActivityIndicator, Alert,
} from 'react-native'
import { Audio } from 'expo-av'
import * as Haptics from 'expo-haptics'
import { LinearGradient } from 'expo-linear-gradient'
import { COLORS, GRAD_COLORS } from '../constants/theme'
import { api } from '../lib/api'

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  isVoice?: boolean
}

export default function ChatScreen() {
  const [messages, setMessages]       = useState<Message[]>([])
  const [input, setInput]             = useState('')
  const [loading, setLoading]         = useState(false)
  const [recording, setRecording]     = useState<Audio.Recording | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [mode, setMode]               = useState<'text' | 'voice'>('text')
  const [sound, setSound]             = useState<Audio.Sound | null>(null)
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [isSpeaking, setIsSpeaking]   = useState(false)
  const speakerWiggle = useRef(new Animated.Value(0)).current

  const listRef = useRef<FlatList>(null)

  const orbScale = useRef(new Animated.Value(1)).current
  const ring1    = useRef(new Animated.Value(1)).current
  const ring2    = useRef(new Animated.Value(1)).current

  useEffect(() => {
    const pulse = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1.06, duration: 1500, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 1,    duration: 1500, useNativeDriver: true }),
        ])
      ).start()
    pulse(ring1, 0)
    pulse(ring2, 400)

    Audio.requestPermissionsAsync()

    return () => { sound?.unloadAsync() }
  }, [])

  const scrollToBottom = () => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100)
  }

  const triggerWiggle = () => {
    speakerWiggle.setValue(0)
    Animated.sequence([
      Animated.timing(speakerWiggle, { toValue: 1,  duration: 60,  useNativeDriver: true }),
      Animated.timing(speakerWiggle, { toValue: -1, duration: 60,  useNativeDriver: true }),
      Animated.timing(speakerWiggle, { toValue: 1,  duration: 60,  useNativeDriver: true }),
      Animated.timing(speakerWiggle, { toValue: -1, duration: 60,  useNativeDriver: true }),
      Animated.timing(speakerWiggle, { toValue: 0,  duration: 60,  useNativeDriver: true }),
    ]).start()
  }

  // ── Text send ──────────────────────────────────────────────────────────────

  const sendText = async () => {
    const msg = input.trim()
    if (!msg || loading) return
    setInput('')
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: msg }
    setMessages(prev => [...prev, userMsg])
    scrollToBottom()
    setLoading(true)
    try {
      const history = messages.slice(-20).map(m => ({ role: m.role, content: m.content }))
      const { response } = await api.elara.chat(msg, history)
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: response }])
      scrollToBottom()
    } catch (e: any) {
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: `Error: ${e.message}` }])
    } finally { setLoading(false) }
  }

  // ── Voice recording ────────────────────────────────────────────────────────

  const startRecording = async () => {
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true })
      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      )
      setRecording(rec)
      setIsRecording(true)
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

      Animated.spring(orbScale, { toValue: 1.15, useNativeDriver: true, friction: 4 }).start()
    } catch {
      Alert.alert('Mic Error', 'Could not access microphone. Check permissions.')
    }
  }

  const stopRecording = async () => {
    if (!recording) return

    Animated.spring(orbScale, { toValue: 1, useNativeDriver: true, friction: 6 }).start()
    setIsRecording(false)
    await recording.stopAndUnloadAsync()
    const uri = recording.getURI()
    setRecording(null)

    if (!uri) return

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)

    const placeholderId = Date.now().toString()
    setMessages(prev => [...prev, { id: placeholderId, role: 'user', content: '🎙 Processing...', isVoice: true }])
    setLoading(true)
    scrollToBottom()

    try {
      const history = messages.slice(-20).map(m => ({ role: m.role, content: m.content }))
      const { transcript, response, audioUrl } = await api.voice.message(uri, 'audio/m4a', history)

      setMessages(prev => prev.map(m =>
        m.id === placeholderId ? { ...m, content: transcript } : m
      ))
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: response }])
      scrollToBottom()

      await playAudio(audioUrl)
    } catch (e: any) {
      setMessages(prev => prev.map(m =>
        m.id === placeholderId ? { ...m, content: '[Voice message failed]' } : m
      ))
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: `Error: ${e.message}` }])
    } finally { setLoading(false) }
  }

  const playAudio = async (audioUrl: string) => {
    triggerWiggle()
    if (!voiceEnabled) return

    try {
      if (sound) {
        await sound.unloadAsync()
        setSound(null)
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      })

      // Short delay to let audio session settle after recording mode
      await new Promise(resolve => setTimeout(resolve, 150))

      let uri = audioUrl

      // Write base64 data URI to temp file — expo-av is more reliable with file URIs
      if (audioUrl.startsWith('data:audio')) {
        const base64Data = audioUrl.split(',')[1]
        const FileSystem = require('expo-file-system')
        const tmpPath = `${FileSystem.cacheDirectory}elara_${Date.now()}.mp3`
        await FileSystem.writeAsStringAsync(tmpPath, base64Data, {
          encoding: FileSystem.EncodingType.Base64,
        })
        uri = tmpPath
      }

      setIsSpeaking(true)
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true, volume: 1.0 }
      )
      setSound(newSound)

      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsSpeaking(false)
          newSound.unloadAsync()
        }
      })

      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    } catch (e) {
      console.error('Audio playback error:', e)
      setIsSpeaking(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === 'user'
    return (
      <View style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowElara]}>
        {!isUser && (
          <View style={styles.avatarOrb}>
            <View style={styles.avatarRing1} />
            <View style={styles.avatarRing2} />
            <View style={styles.avatarCore} />
          </View>
        )}
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleElara]}>
          {item.isVoice && <Text style={styles.voiceTag}>🎙 </Text>}
          <Text style={styles.bubbleText}>{item.content}</Text>
        </View>
        {isUser && (
          <View style={styles.avatarUser}>
            <Text style={styles.avatarUserText}>U</Text>
          </View>
        )}
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.kav}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerOrb}>
            <Animated.View style={[styles.headerRing1, { transform: [{ scale: ring1 }] }]} />
            <Animated.View style={[styles.headerRing2, { transform: [{ scale: ring2 }] }]} />
            <View style={styles.headerCore} />
          </View>
          <View>
            <Text style={styles.headerName}>ELARA</Text>
            <View style={styles.headerStatus}>
              <View style={styles.onlineDot} />
              <Text style={styles.headerStatusText}>ONLINE</Text>
            </View>
          </View>
          {/* Speaker toggle + mode toggle */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 'auto', gap: 4 }}>
            <TouchableOpacity
              onPress={() => setVoiceEnabled(v => !v)}
              style={styles.modeToggle}
              activeOpacity={0.7}
            >
              <Animated.View style={{
                transform: [{
                  rotate: speakerWiggle.interpolate({
                    inputRange: [-1, 0, 1],
                    outputRange: ['-12deg', '0deg', '12deg'],
                  })
                }]
              }}>
                <Text style={[styles.modeToggleText, !voiceEnabled && { opacity: 0.3 }]}>
                  {isSpeaking ? '🔊' : voiceEnabled ? '🔈' : '🔇'}
                </Text>
              </Animated.View>
              {isSpeaking && (
                <View style={{
                  position: 'absolute', top: 6, right: 6,
                  width: 7, height: 7, borderRadius: 4,
                  backgroundColor: '#4ACCFE',
                  elevation: 4,
                }} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setMode(m => m === 'text' ? 'voice' : 'text')}
              style={styles.modeToggle}
            >
              <Text style={styles.modeToggleText}>{mode === 'text' ? '🎙' : '⌨️'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <LinearGradient colors={GRAD_COLORS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.topBar} />

        {/* Messages */}
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => m.id}
          renderItem={renderMessage}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyOrb}>
                <View style={styles.emptyRing1} />
                <View style={styles.emptyRing2} />
                <View style={styles.emptyCore} />
              </View>
              <Text style={styles.emptyTitle}>ELARA READY</Text>
              <Text style={styles.emptyText}>
                {mode === 'voice' ? 'Hold the orb to speak.' : 'Type a message or switch to voice mode.'}
              </Text>
            </View>
          }
        />

        {loading && (
          <View style={styles.thinkingBar}>
            <ActivityIndicator size="small" color={COLORS.violet} />
            <Text style={styles.thinkingText}>Elara is thinking...</Text>
          </View>
        )}

        {/* Input area */}
        {mode === 'text' ? (
          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={sendText}
              placeholder="Message Elara..."
              placeholderTextColor={COLORS.dim}
              multiline
            />
            <TouchableOpacity onPress={sendText} disabled={loading || !input.trim()} activeOpacity={0.8}>
              <LinearGradient
                colors={loading || !input.trim() ? [COLORS.bgMid, COLORS.bgMid] : GRAD_COLORS}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.sendBtn}
              >
                <Text style={styles.sendBtnText}>↑</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.voiceArea}>
            <Text style={styles.voiceHint}>
              {isRecording ? 'Release to send...' : 'Hold to speak'}
            </Text>
            <Pressable
              onPressIn={startRecording}
              onPressOut={stopRecording}
              disabled={loading}
            >
              <Animated.View style={[styles.voiceOrb, { transform: [{ scale: orbScale }] }]}>
                <LinearGradient
                  colors={isRecording ? ['#EA1823', '#8D1845', '#5949AC'] : [COLORS.bgCard, COLORS.bgMid]}
                  style={styles.voiceOrbGrad}
                >
                  <View style={styles.voiceOrbRing1} />
                  <View style={styles.voiceOrbRing2} />
                  <View style={styles.voiceOrbCore} />
                  <Text style={styles.voiceOrbIcon}>{isRecording ? '⬤' : '🎙'}</Text>
                </LinearGradient>
              </Animated.View>
            </Pressable>
            <Text style={styles.voiceMode}>VOICE MODE</Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:             { flex: 1, backgroundColor: COLORS.bg },
  kav:              { flex: 1 },
  header:           { flexDirection: 'row', alignItems: 'center', padding: 16, paddingBottom: 10, gap: 12, backgroundColor: COLORS.bgDark },
  headerOrb:        { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerRing1:      { position: 'absolute', width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: COLORS.crimson, opacity: .7 },
  headerRing2:      { position: 'absolute', width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: COLORS.violet, opacity: .6 },
  headerCore:       { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.cyan, opacity: .8 },
  headerName:       { fontWeight: '900', fontSize: 16, letterSpacing: 4, color: COLORS.cyan },
  headerStatus:     { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  onlineDot:        { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.green },
  headerStatusText: { fontFamily: 'Courier New', fontSize: 10, color: COLORS.green, letterSpacing: 1 },
  modeToggle:       { marginLeft: 'auto', padding: 8 },
  modeToggleText:   { fontSize: 20 },
  topBar:           { height: 1.5 },
  list:             { flex: 1 },
  listContent:      { padding: 16, paddingBottom: 8 },
  msgRow:           { flexDirection: 'row', marginBottom: 14, alignItems: 'flex-start', gap: 8 },
  msgRowUser:       { flexDirection: 'row-reverse' },
  msgRowElara:      {},
  avatarOrb:        { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', marginTop: 2, flexShrink: 0 },
  avatarRing1:      { position: 'absolute', width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: COLORS.crimson, opacity: .7 },
  avatarRing2:      { position: 'absolute', width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: COLORS.violet, opacity: .5 },
  avatarCore:       { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.cyan, opacity: .8 },
  avatarUser:       { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(234,24,35,.15)', borderWidth: 1, borderColor: 'rgba(234,24,35,.3)', alignItems: 'center', justifyContent: 'center', marginTop: 2, flexShrink: 0 },
  avatarUserText:   { fontFamily: 'Courier New', fontSize: 10, color: COLORS.crimson },
  bubble:           { maxWidth: '78%', borderRadius: 12, padding: 11 },
  bubbleElara:      { backgroundColor: 'rgba(89,73,172,.08)', borderWidth: 1, borderColor: 'rgba(89,73,172,.2)', borderTopLeftRadius: 3 },
  bubbleUser:       { backgroundColor: 'rgba(234,24,35,.08)', borderWidth: 1, borderColor: 'rgba(234,24,35,.18)', borderTopRightRadius: 3 },
  bubbleText:       { color: COLORS.text, fontSize: 15, lineHeight: 22 },
  voiceTag:         { fontSize: 12, color: COLORS.violet },
  thinkingBar:      { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, paddingHorizontal: 16 },
  thinkingText:     { fontFamily: 'Courier New', fontSize: 12, color: COLORS.dim },
  inputRow:         { flexDirection: 'row', padding: 12, gap: 8, alignItems: 'flex-end', borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.bgDark },
  textInput:        { flex: 1, backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.borderLit, borderRadius: 8, color: COLORS.text, fontSize: 15, padding: 10, maxHeight: 100 },
  sendBtn:          { width: 42, height: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sendBtnText:      { color: 'white', fontSize: 18, fontWeight: '700' },
  voiceArea:        { alignItems: 'center', paddingVertical: 20, paddingBottom: 30, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.bgDark },
  voiceHint:        { fontFamily: 'Courier New', fontSize: 11, color: COLORS.dim, letterSpacing: 2, marginBottom: 16 },
  voiceOrb:         { width: 110, height: 110, borderRadius: 55, overflow: 'hidden' },
  voiceOrbGrad:     { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', borderRadius: 55, borderWidth: 1.5, borderColor: COLORS.border },
  voiceOrbRing1:    { position: 'absolute', width: 100, height: 100, borderRadius: 50, borderWidth: 1.5, borderColor: COLORS.crimson, opacity: .5 },
  voiceOrbRing2:    { position: 'absolute', width: 70, height: 70, borderRadius: 35, borderWidth: 1, borderColor: COLORS.violet, opacity: .4 },
  voiceOrbCore:     { position: 'absolute', width: 20, height: 20, borderRadius: 10, backgroundColor: COLORS.cyan, opacity: .5 },
  voiceOrbIcon:     { fontSize: 28, zIndex: 1 },
  voiceMode:        { marginTop: 14, fontFamily: 'Courier New', fontSize: 9, color: COLORS.dim, letterSpacing: 3 },
  empty:            { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyOrb:         { width: 70, height: 70, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyRing1:       { position: 'absolute', width: 70, height: 70, borderRadius: 35, borderWidth: 1.5, borderColor: COLORS.crimson, opacity: .4 },
  emptyRing2:       { position: 'absolute', width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: COLORS.violet, opacity: .35 },
  emptyCore:        { width: 14, height: 14, borderRadius: 7, backgroundColor: COLORS.cyan, opacity: .5 },
  emptyTitle:       { fontWeight: '700', fontSize: 14, letterSpacing: 4, color: COLORS.violet, marginBottom: 8 },
  emptyText:        { fontFamily: 'Courier New', fontSize: 12, color: COLORS.dim, textAlign: 'center', lineHeight: 20, paddingHorizontal: 40 },
})
