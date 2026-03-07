/**
 * Google Drive + Docs — read + draft-write
 * Draft mode: creates NEW docs only, never edits originals.
 */

import { google } from 'googleapis'
import { createOAuthClient, isGoogleConfigured } from '../lib/google-auth.js'
import type { ToolResult, AgentTool } from '../types/index.js'

export interface DriveFile {
  id: string; name: string; mimeType: string; modifiedTime: string; webViewLink?: string
}
export interface DriveData { recentFiles: DriveFile[]; checkedAt: string }

export async function runDriveCheck(): Promise<ToolResult<DriveData>> {
  const timestamp = new Date().toISOString()
  if (!isGoogleConfigured()) return { tool: 'drive', success: false, timestamp, data: { recentFiles: [], checkedAt: timestamp }, error: 'Google OAuth not configured.' }
  try {
    const auth = createOAuthClient()
    const drive = google.drive({ version: 'v3', auth })
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID
    const fields = 'files(id,name,mimeType,modifiedTime,webViewLink)'

    const toFile = (f: Record<string, string | undefined>): DriveFile => ({
      id: f.id || '', name: f.name || '', mimeType: f.mimeType || '',
      modifiedTime: f.modifiedTime || '', webViewLink: f.webViewLink || undefined,
    })

    if (folderId) {
      // Two queries in parallel: folder itself + files inside it
      const [folderRes, childrenRes] = await Promise.all([
        drive.files.list({ q: `'${folderId}' in parents and trashed = false`, fields, orderBy: 'modifiedTime desc', pageSize: 25 }),
        drive.files.list({ q: `'${folderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`, fields, orderBy: 'modifiedTime desc', pageSize: 25 }),
      ])
      const seen = new Set<string>()
      const files: DriveFile[] = []
      for (const f of [...(folderRes.data.files || []), ...(childrenRes.data.files || [])]) {
        const id = f.id || ''
        if (id && !seen.has(id)) { seen.add(id); files.push(toFile(f as Record<string, string | undefined>)) }
      }
      files.sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime))
      return { tool: 'drive', success: true, timestamp, data: { recentFiles: files.slice(0, 30), checkedAt: timestamp } }
    }

    const res = await drive.files.list({ q: 'trashed = false', fields, orderBy: 'modifiedTime desc', pageSize: 25 })
    const files: DriveFile[] = (res.data.files || []).map(f => toFile(f as Record<string, string | undefined>))
    return { tool: 'drive', success: true, timestamp, data: { recentFiles: files, checkedAt: timestamp } }
  } catch (err) { return { tool: 'drive', success: false, timestamp, data: { recentFiles: [], checkedAt: timestamp }, error: err instanceof Error ? err.message : 'Unknown' } }
}

export async function searchDriveFile(name: string): Promise<ToolResult<DriveFile[]>> {
  const timestamp = new Date().toISOString()
  if (!isGoogleConfigured()) return { tool: 'drive_search', success: false, timestamp, data: [], error: 'Google OAuth not configured.' }
  try {
    const auth = createOAuthClient()
    const drive = google.drive({ version: 'v3', auth })
    const res = await drive.files.list({ q: `name contains '${name.replace(/'/g,"\\'")}' and trashed = false`, fields: 'files(id,name,mimeType,modifiedTime,webViewLink)', orderBy: 'modifiedTime desc', pageSize: 10 })
    const files: DriveFile[] = (res.data.files || []).map(f => ({ id: f.id||'', name: f.name||'', mimeType: f.mimeType||'', modifiedTime: f.modifiedTime||'', webViewLink: f.webViewLink||undefined }))
    return { tool: 'drive_search', success: true, timestamp, data: files }
  } catch (err) { return { tool: 'drive_search', success: false, timestamp, data: [], error: err instanceof Error ? err.message : 'Unknown' } }
}

export async function readGoogleDoc(fileId: string): Promise<ToolResult<{ content: string; title: string }>> {
  const timestamp = new Date().toISOString()
  if (!isGoogleConfigured()) return { tool: 'drive_read', success: false, timestamp, data: { content: '', title: '' }, error: 'Google OAuth not configured.' }
  try {
    const auth = createOAuthClient()
    const docs = google.docs({ version: 'v1', auth })
    const doc = await docs.documents.get({ documentId: fileId })
    const title = doc.data.title || ''
    let content = ''
    for (const el of (doc.data.body?.content || [])) {
      if (el.paragraph) for (const pe of el.paragraph.elements || []) if (pe.textRun?.content) content += pe.textRun.content
    }
    return { tool: 'drive_read', success: true, timestamp, data: { content: content.slice(0, 10000), title } }
  } catch (err) { return { tool: 'drive_read', success: false, timestamp, data: { content: '', title: '' }, error: err instanceof Error ? err.message : 'Unknown' } }
}

export async function createDraftDoc(title: string, content: string, context?: string): Promise<ToolResult<{ docId: string; docUrl: string; title: string }>> {
  const timestamp = new Date().toISOString()
  if (!isGoogleConfigured()) return { tool: 'drive_create_draft', success: false, timestamp, data: { docId: '', docUrl: '', title }, error: 'Google OAuth not configured.' }
  try {
    const auth = createOAuthClient()
    const docs = google.docs({ version: 'v1', auth })
    const drive = google.drive({ version: 'v3', auth })
    const draftTitle = `[DRAFT] ${title} — ${new Date().toLocaleDateString('en-US')}`
    const createRes = await docs.documents.create({ requestBody: { title: draftTitle } })
    const docId = createRes.data.documentId!
    const header = `ELARA DRAFT — Review before applying\n${context || `Created: ${new Date().toLocaleString()}`}\n\n---\n\n`
    await docs.documents.batchUpdate({ documentId: docId, requestBody: { requests: [{ insertText: { location: { index: 1 }, text: header + content } }] } })
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID
    if (folderId) await drive.files.update({ fileId: docId, addParents: folderId, fields: 'id,parents' })
    const docUrl = `https://docs.google.com/document/d/${docId}/edit`
    return { tool: 'drive_create_draft', success: true, timestamp, data: { docId, docUrl, title: draftTitle } }
  } catch (err) { return { tool: 'drive_create_draft', success: false, timestamp, data: { docId: '', docUrl: '', title }, error: err instanceof Error ? err.message : 'Unknown' } }
}

export const driveTool: AgentTool = {
  name: 'list_drive_files', description: 'Lists recently modified files in the CFP Google Drive folder.',
  input_schema: { type: 'object', properties: {}, required: [] },
  execute: async () => runDriveCheck(),
}

export const driveSearchTool: AgentTool = {
  name: 'search_drive_file', description: 'Search for a specific file in Google Drive by name. Use this when Clutch asks for a specific document by name.',
  input_schema: { type: 'object', properties: { name: { type: 'string', description: 'File name or partial name to search for' } }, required: ['name'] },
  execute: async (i) => searchDriveFile(i.name as string),
}

export const driveReadTool: AgentTool = {
  name: 'read_google_doc', description: 'Read the text content of a Google Doc by file ID.',
  input_schema: { type: 'object', properties: { fileId: { type: 'string', description: 'Google Drive file ID' } }, required: ['fileId'] },
  execute: async (i) => readGoogleDoc(i.fileId as string),
}

export const driveCreateDraftTool: AgentTool = {
  name: 'create_draft_doc',
  description: 'Create a new DRAFT Google Doc. Use for proposed doc updates, meeting notes, investor briefs, scripts, or any written output. ALWAYS creates a new draft — never edits originals.',
  input_schema: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string' }, context: { type: 'string', description: 'What this draft is for' } }, required: ['title', 'content'] },
  execute: async (i) => createDraftDoc(i.title as string, i.content as string, i.context as string|undefined),
}
