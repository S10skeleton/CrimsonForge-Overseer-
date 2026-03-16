/**
 * Voice route — push-to-talk pipeline for the Jarvis mobile app
 *
 * POST /api/voice/message
 *   Accepts: multipart/form-data with audio file + optional history JSON
 *   Returns: { transcript, response, audioUrl }
 *            audioUrl is a base64 data URI the app plays directly
 *
 * POST /api/voice/speak
 *   Accepts: { text } — converts any text to Elara's voice
 *   Returns: { audioUrl } base64 data URI
 */

import { Router } from 'express'
import multer from 'multer'
import { DeepgramClient } from '@deepgram/sdk'
import { requireAuth } from '../middleware/auth.js'
import { runAgent } from '../../agent/index.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })

// ── Deepgram client ────────────────────────────────────────────────────────

function getDeepgram() {
  const key = process.env.DEEPGRAM_API_KEY
  if (!key) throw new Error('DEEPGRAM_API_KEY not configured')
  return new DeepgramClient({ apiKey: key })
}

// ── ElevenLabs TTS ─────────────────────────────────────────────────────────

async function textToSpeech(text: string): Promise<Buffer> {
  const apiKey  = process.env.ELEVENLABS_API_KEY
  const voiceId = process.env.ELEVENLABS_VOICE_ID

  if (!apiKey || !voiceId) throw new Error('ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID not configured')

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_turbo_v2',
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.82,
        style: 0.3,
        use_speaker_boost: true,
      },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`ElevenLabs error ${res.status}: ${err}`)
  }

  return Buffer.from(await res.arrayBuffer())
}

// ── Voice-mode system prompt addendum ──────────────────────────────────────
// Injected so Elara formats responses for speech, not text

const VOICE_ADDENDUM = `
VOICE MODE ACTIVE.
You are responding to a voice message. The user will hear your response read aloud.
Critical formatting rules for voice responses:
- No markdown. No bullet points. No asterisks. No code blocks.
- Write in natural spoken sentences only.
- Keep responses under 3 sentences unless the question requires more.
- Spell out numbers and abbreviations that don't read naturally (e.g. "three hundred" not "300", "API" stays as "API").
- Never start with "Sure," or "Of course," or "Great question." Just answer.
- If you need to convey a list, weave it into natural speech: "Three things: first X, then Y, finally Z."
`.trim()

// ── POST /api/voice/message ────────────────────────────────────────────────

router.post('/message', requireAuth, upload.single('audio'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No audio file provided' })
    return
  }

  const history: Array<{ role: 'user' | 'assistant'; content: string }> = (() => {
    try { return JSON.parse(req.body.history ?? '[]') }
    catch { return [] }
  })()

  try {
    // Step 1: Transcribe with Deepgram
    const dg = getDeepgram()
    const result = await dg.listen.v1.media.transcribeFile(
      req.file.buffer,
      {
        model: 'nova-2',
        smart_format: true,
        punctuate: true,
        language: 'en-US',
      }
    )

    // v5 returns the response directly (no { result, error } wrapper)
    const dgResult = result as any
    const transcript: string = dgResult?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? ''

    if (!transcript.trim()) {
      res.status(400).json({ error: 'Could not transcribe audio — please try again' })
      return
    }

    console.log(`[voice] Transcript: "${transcript.slice(0, 100)}"`)

    // Step 2: Run Elara agent with voice-mode instructions prepended to history
    const voiceMessage = `[VOICE MODE] ${transcript}`
    const response = await runAgent(voiceMessage, undefined, [
      { role: 'user', content: VOICE_ADDENDUM },
      { role: 'assistant', content: 'Voice mode active. I will respond in spoken sentences without markdown.' },
      ...history,
    ])

    console.log(`[voice] Response: "${response.slice(0, 100)}"`)

    // Step 3: Convert response to speech
    const audioBuffer = await textToSpeech(response)
    const audioUrl = `data:audio/mpeg;base64,${audioBuffer.toString('base64')}`

    res.json({ transcript, response, audioUrl })

  } catch (err) {
    console.error('[voice/message] Error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : JSON.stringify(err) })
  }
})

// ── POST /api/voice/speak ──────────────────────────────────────────────────
// Convert arbitrary text to Elara's voice — used for proactive alerts

router.post('/speak', requireAuth, async (req, res) => {
  const { text } = req.body as { text?: string }

  if (!text?.trim()) {
    res.status(400).json({ error: 'text is required' })
    return
  }

  try {
    const audioBuffer = await textToSpeech(text)
    const audioUrl = `data:audio/mpeg;base64,${audioBuffer.toString('base64')}`
    res.json({ audioUrl })
  } catch (err) {
    console.error('[voice/speak] Error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : JSON.stringify(err) })
  }
})

export default router
