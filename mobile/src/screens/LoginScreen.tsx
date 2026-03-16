import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, Animated,
  StyleSheet, SafeAreaView, KeyboardAvoidingView, Platform,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import * as Haptics from 'expo-haptics'
import { COLORS, GRAD_COLORS } from '../constants/theme'
import { api, setToken } from '../lib/api'

interface Props { onLogin: () => void }

export default function LoginScreen({ onLogin }: Props) {
  const [pass, setPass]         = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [locked, setLocked]     = useState(false)
  const [countdown, setCountdown] = useState(0)

  const ring1 = useRef(new Animated.Value(1)).current
  const ring2 = useRef(new Animated.Value(1)).current
  const ring3 = useRef(new Animated.Value(1)).current
  const fade  = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 600, useNativeDriver: true }).start()

    const pulse = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1.08, duration: 1200, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 1,    duration: 1200, useNativeDriver: true }),
        ])
      ).start()

    pulse(ring1, 0)
    pulse(ring2, 350)
    pulse(ring3, 700)
  }, [])

  useEffect(() => {
    if (!locked || countdown <= 0) return
    const t = setInterval(() => setCountdown(p => {
      if (p <= 1) { setLocked(false); setError(''); return 0 }
      return p - 1
    }), 1000)
    return () => clearInterval(t)
  }, [locked, countdown])

  const handleSubmit = async () => {
    if (!pass.trim() || loading || locked) return
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setLoading(true); setError('')
    try {
      const { token } = await api.auth.login(pass.trim())
      await setToken(token)
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      onLogin()
    } catch (e: any) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      let msg = 'Incorrect passphrase'
      try {
        const b = JSON.parse(e.message)
        msg = b.error ?? msg
        if (b.locked) { setLocked(true); setCountdown(b.secondsRemaining ?? 900) }
      } catch { msg = e.message ?? 'Connection error' }
      setError(msg); setPass('')
    } finally { setLoading(false) }
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.kav}>
        <Animated.View style={[styles.container, { opacity: fade }]}>

          {/* Orb */}
          <View style={styles.orbContainer}>
            <Animated.View style={[styles.ring, styles.ring1, { transform: [{ scale: ring1 }] }]} />
            <Animated.View style={[styles.ring, styles.ring2, { transform: [{ scale: ring2 }] }]} />
            <Animated.View style={[styles.ring, styles.ring3, { transform: [{ scale: ring3 }] }]} />
            <View style={styles.orbCore} />
          </View>

          <Text style={styles.name}>E L A R A</Text>
          <Text style={styles.subtitle}>AI OPERATIONS INTELLIGENCE</Text>

          <View style={styles.card}>
            <LinearGradient
              colors={GRAD_COLORS}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.cardTopBar}
            />

            {locked ? (
              <View style={styles.lockoutContainer}>
                <Text style={styles.lockoutTimer}>{fmt(countdown)}</Text>
                <Text style={styles.lockoutText}>Access suspended.{'\n'}Too many failed attempts.</Text>
              </View>
            ) : (
              <>
                <Text style={styles.fieldLabel}>PASSPHRASE</Text>
                <TextInput
                  style={[styles.input, error ? styles.inputError : null]}
                  secureTextEntry
                  value={pass}
                  onChangeText={setPass}
                  onSubmitEditing={handleSubmit}
                  placeholder="············"
                  placeholderTextColor={COLORS.dimmer}
                  autoFocus
                  editable={!loading}
                />
                {error ? <Text style={styles.error}>{error}</Text> : null}

                <TouchableOpacity
                  onPress={handleSubmit}
                  disabled={loading || !pass.trim()}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={loading || !pass.trim() ? [COLORS.bgMid, COLORS.bgMid] : GRAD_COLORS}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={styles.button}
                  >
                    <Text style={[styles.buttonText, (loading || !pass.trim()) && styles.buttonTextDim]}>
                      {loading ? 'AUTHENTICATING...' : 'ACCESS CONSOLE'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}

            <View style={styles.cardFooter}>
              <Text style={styles.cardFooterText}>AES-256 // EPHEMERAL</Text>
              <Text style={styles.cardFooterText}>v0.3.2</Text>
            </View>
          </View>

          <Text style={styles.restricted}>// RESTRICTED — AUTHORIZED PERSONNEL ONLY</Text>
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const ORB = 100

const styles = StyleSheet.create({
  safe:             { flex: 1, backgroundColor: COLORS.bg },
  kav:              { flex: 1 },
  container:        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  orbContainer:     { width: ORB, height: ORB, alignItems: 'center', justifyContent: 'center', marginBottom: 28 },
  ring:             { position: 'absolute', borderRadius: 999, borderStyle: 'solid' },
  ring1:            { width: ORB,         height: ORB,         borderWidth: 2,   borderColor: COLORS.crimson, opacity: .7 },
  ring2:            { width: ORB * .74,   height: ORB * .74,   borderWidth: 1.5, borderColor: COLORS.maroon,  opacity: .65 },
  ring3:            { width: ORB * .5,    height: ORB * .5,    borderWidth: 1,   borderColor: COLORS.violet,  opacity: .6 },
  orbCore:          { width: ORB * .22, height: ORB * .22, borderRadius: 999, backgroundColor: COLORS.cyan, opacity: .7 },
  name:             { fontWeight: '900', fontSize: 22, letterSpacing: 10, color: COLORS.cyan, marginBottom: 6 },
  subtitle:         { fontFamily: 'Courier New', fontSize: 9, letterSpacing: 4, color: COLORS.dimmer, marginBottom: 36 },
  card:             { width: '100%', maxWidth: 340, backgroundColor: COLORS.bgCard, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  cardTopBar:       { height: 2, width: '100%' },
  fieldLabel:       { fontFamily: 'Courier New', fontSize: 9, letterSpacing: 2, color: COLORS.dim, margin: 20, marginBottom: 8 },
  input:            { marginHorizontal: 20, height: 46, backgroundColor: COLORS.bgDark, borderRadius: 6, borderWidth: 1, borderColor: COLORS.borderLit, color: COLORS.violet, fontFamily: 'Courier New', fontSize: 20, letterSpacing: 5, paddingHorizontal: 14 },
  inputError:       { borderColor: 'rgba(239,68,68,.5)' },
  error:            { marginHorizontal: 20, marginTop: 8, color: COLORS.red, fontFamily: 'Courier New', fontSize: 11, letterSpacing: .5 },
  button:           { margin: 20, marginTop: 14, borderRadius: 6, padding: 12, alignItems: 'center' },
  buttonText:       { fontWeight: '700', fontSize: 12, letterSpacing: 3, color: 'white' },
  buttonTextDim:    { color: COLORS.dim },
  cardFooter:       { flexDirection: 'row', justifyContent: 'space-between', padding: 10, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: COLORS.border },
  cardFooterText:   { fontFamily: 'Courier New', fontSize: 9, color: COLORS.dimmer, letterSpacing: 1 },
  lockoutContainer: { padding: 24, alignItems: 'center' },
  lockoutTimer:     { fontWeight: '900', fontSize: 36, color: COLORS.red, marginBottom: 10 },
  lockoutText:      { fontFamily: 'Courier New', fontSize: 12, color: COLORS.dim, textAlign: 'center', lineHeight: 20 },
  restricted:       { marginTop: 24, fontFamily: 'Courier New', fontSize: 9, color: COLORS.dimmer, letterSpacing: 3, opacity: .5 },
})
