/**
 * File routes — Drive integration for the Jarvis mobile app
 *
 * GET  /api/files/list         — list files in Elara workspace + recent Drive files
 * POST /api/files/upload       — upload a file/photo to Elara workspace
 * GET  /api/files/:id/link     — generate a temporary download link
 * POST /api/files/ask          — ask Elara about a specific file by Drive ID
 */

import { Router } from 'express'
import multer from 'multer'
import { google } from 'googleapis'
import { Readable } from 'stream'
import { requireAuth } from '../middleware/auth.js'
import { runAgent } from '../../agent/index.js'
import { createOAuthClient } from '../../lib/google-auth.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })

function getDrive() {
  const auth = createOAuthClient()
  return google.drive({ version: 'v3', auth })
}

function getWorkspaceFolderId(): string {
  const id = process.env.GOOGLE_DRIVE_ELARA_FOLDER_ID
  if (!id) throw new Error('GOOGLE_DRIVE_ELARA_FOLDER_ID not configured')
  return id
}

// ── GET /api/files/list ────────────────────────────────────────────────────

router.get('/list', requireAuth, async (_req, res) => {
  try {
    const drive    = getDrive()
    const folderId = getWorkspaceFolderId()

    const [workspaceRes, recentRes] = await Promise.all([
      drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink,iconLink)',
        orderBy: 'modifiedTime desc',
        pageSize: 50,
      }),
      drive.files.list({
        q: "trashed = false and (mimeType = 'application/vnd.google-apps.document' or mimeType = 'application/pdf' or mimeType contains 'image/')",
        fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink)',
        orderBy: 'modifiedTime desc',
        pageSize: 20,
      }),
    ])

    res.json({
      workspace: workspaceRes.data.files ?? [],
      recent: recentRes.data.files ?? [],
    })
  } catch (err) {
    console.error('[files/list] Error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : JSON.stringify(err) })
  }
})

// ── POST /api/files/upload ─────────────────────────────────────────────────

router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file provided' })
    return
  }

  const { caption } = req.body as { caption?: string }

  try {
    const drive    = getDrive()
    const folderId = getWorkspaceFolderId()

    const ts       = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const origName = req.file.originalname || 'upload'
    const filename = `${ts}_${origName}`

    const stream = new Readable()
    stream.push(req.file.buffer)
    stream.push(null)

    const uploadRes = await drive.files.create({
      requestBody: {
        name: filename,
        parents: [folderId],
        description: caption ?? `Uploaded from Elara mobile app — ${new Date().toLocaleString()}`,
      },
      media: {
        mimeType: req.file.mimetype,
        body: stream,
      },
      fields: 'id,name,mimeType,size,webViewLink',
    })

    const file = uploadRes.data

    let elaraNote: string | null = null
    if (caption?.trim()) {
      try {
        elaraNote = await runAgent(
          `I just uploaded a file called "${filename}" to your workspace. The user's note: "${caption}". ` +
          `Acknowledge briefly (1 sentence) and let them know you have it.`,
          undefined, []
        )
      } catch { /* non-fatal */ }
    }

    res.json({
      success: true,
      file: {
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
        webViewLink: file.webViewLink,
      },
      elaraNote,
    })
  } catch (err) {
    console.error('[files/upload] Error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : JSON.stringify(err) })
  }
})

// ── GET /api/files/:id/link ────────────────────────────────────────────────

router.get('/:id/link', requireAuth, async (req, res) => {
  const { id } = req.params

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const drive = getDrive() as any

    const meta = await drive.files.get({
      fileId: id,
      fields: 'id,name,mimeType,webViewLink,webContentLink',
    })

    const nativeTypes: Record<string, string> = {
      'application/vnd.google-apps.document':     'application/pdf',
      'application/vnd.google-apps.spreadsheet':  'text/csv',
      'application/vnd.google-apps.presentation': 'application/pdf',
    }

    const mimeType   = (meta.data.mimeType ?? '') as string
    const exportMime = nativeTypes[mimeType]

    if (exportMime) {
      const exportRes = await drive.files.export(
        { fileId: id, mimeType: exportMime },
        { responseType: 'arraybuffer' }
      )
      const base64 = Buffer.from(exportRes.data as ArrayBuffer).toString('base64')
      const ext = exportMime === 'text/csv' ? 'csv' : 'pdf'
      res.json({
        name: meta.data.name,
        mimeType: exportMime,
        downloadUrl: `data:${exportMime};base64,${base64}`,
        filename: `${meta.data.name}.${ext}`,
      })
    } else {
      const fileRes = await drive.files.get(
        { fileId: id, alt: 'media' },
        { responseType: 'arraybuffer' }
      )
      const base64 = Buffer.from(fileRes.data as ArrayBuffer).toString('base64')
      res.json({
        name: meta.data.name,
        mimeType,
        downloadUrl: `data:${mimeType};base64,${base64}`,
        filename: meta.data.name,
        webViewLink: meta.data.webViewLink,
      })
    }
  } catch (err) {
    console.error('[files/link] Error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : JSON.stringify(err) })
  }
})

// ── POST /api/files/ask ────────────────────────────────────────────────────

router.post('/ask', requireAuth, async (req, res) => {
  const { fileId, question } = req.body as { fileId?: string; question?: string }

  if (!fileId || !question?.trim()) {
    res.status(400).json({ error: 'fileId and question are required' })
    return
  }

  try {
    const response = await runAgent(
      `Please read the Drive file with ID "${fileId}" using the read_drive_file tool, ` +
      `then answer this question about it: ${question}`,
      undefined, []
    )
    res.json({ response })
  } catch (err) {
    console.error('[files/ask] Error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : JSON.stringify(err) })
  }
})

export default router
