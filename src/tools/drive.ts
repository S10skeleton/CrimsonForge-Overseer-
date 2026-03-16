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

// ─── Format-aware Drive file reader ──────────────────────────────────────

/**
 * Extracts text from a .docx binary buffer by parsing the XML.
 * docx files are ZIP archives — word/document.xml contains all the text.
 * This approach requires no external dependencies.
 */
function extractTextFromDocx(buffer: Buffer): string {
  try {
    // docx files are ZIP archives. We look for the XML content between
    // the ZIP entries by scanning for the document.xml content markers.
    // This works because ZIP stores file contents as raw bytes we can scan.
    const str = buffer.toString('binary')

    // Find word/document.xml content in the ZIP
    // Look for the XML content that follows the filename marker
    const xmlStart = str.indexOf('<w:body')
    const xmlEnd = str.indexOf('</w:body>')

    if (xmlStart === -1 || xmlEnd === -1) {
      // Fallback: extract any readable text between XML tags
      return extractTextFromXML(str)
    }

    const bodyXml = str.slice(xmlStart, xmlEnd + 9)
    return extractTextFromXML(bodyXml)
  } catch {
    return '[Could not extract text from docx]'
  }
}

function extractTextFromXML(xml: string): string {
  // Extract text content from XML, handling paragraph breaks
  let text = ''
  let inTag = false
  let currentParagraph = ''
  let i = 0

  while (i < xml.length) {
    const char = xml[i]

    if (char === '<') {
      inTag = true
      // Check if this is a paragraph end tag
      const remaining = xml.slice(i, Math.min(i + 10, xml.length))
      if (remaining.startsWith('</w:p>') || remaining.startsWith('</w:tr>')) {
        if (currentParagraph.trim()) {
          text += currentParagraph.trim() + '\n'
          currentParagraph = ''
        }
      }
    } else if (char === '>') {
      inTag = false
    } else if (!inTag) {
      // Only include printable ASCII and common unicode
      const code = xml.charCodeAt(i)
      if ((code >= 32 && code < 127) || code > 127) {
        currentParagraph += char
      }
    }
    i++
  }

  if (currentParagraph.trim()) {
    text += currentParagraph.trim()
  }

  // Clean up: remove excessive whitespace, normalize line breaks
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

export async function readDriveFile(fileId: string): Promise<ToolResult<{ content: string; title: string; mimeType: string; fileId: string }>> {
  const timestamp = new Date().toISOString()
  const empty = { content: '', title: '', mimeType: '', fileId }

  if (!isGoogleConfigured()) {
    return { tool: 'read_drive_file', success: false, timestamp, data: empty, error: 'Google OAuth not configured.' }
  }

  try {
    const auth = createOAuthClient()
    const drive = google.drive({ version: 'v3', auth })

    // Step 1: Get file metadata to determine type
    const metaRes = await drive.files.get({
      fileId,
      fields: 'id,name,mimeType',
    })

    const fileName = metaRes.data.name || 'Unknown'
    const mimeType = metaRes.data.mimeType || ''

    console.log(`[drive] Reading file: "${fileName}" (${mimeType})`)

    // Step 2: Route to correct reader based on mimeType
    let content = ''

    // ── Native Google Docs ────────────────────────────────────────────────
    if (mimeType === 'application/vnd.google-apps.document') {
      const docs = google.docs({ version: 'v1', auth })
      const doc = await docs.documents.get({ documentId: fileId })
      for (const el of (doc.data.body?.content || [])) {
        if (el.paragraph) {
          for (const pe of el.paragraph.elements || []) {
            if (pe.textRun?.content) content += pe.textRun.content
          }
        }
      }
    }

    // ── Google Sheets → export as CSV ─────────────────────────────────────
    else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      const exportRes = await drive.files.export(
        { fileId, mimeType: 'text/csv' },
        { responseType: 'arraybuffer' }
      )
      content = Buffer.from(exportRes.data as ArrayBuffer).toString('utf8').slice(0, 10000)
    }

    // ── Google Slides → export as plain text ──────────────────────────────
    else if (mimeType === 'application/vnd.google-apps.presentation') {
      const exportRes = await drive.files.export(
        { fileId, mimeType: 'text/plain' },
        { responseType: 'arraybuffer' }
      )
      content = Buffer.from(exportRes.data as ArrayBuffer).toString('utf8').slice(0, 10000)
    }

    // ── PDF → export as plain text ────────────────────────────────────────
    else if (mimeType === 'application/pdf') {
      try {
        const exportRes = await drive.files.export(
          { fileId, mimeType: 'text/plain' },
          { responseType: 'arraybuffer' }
        )
        content = Buffer.from(exportRes.data as ArrayBuffer).toString('utf8').slice(0, 10000)
      } catch {
        // PDF export only works if Drive has a text layer
        content = '[PDF text extraction unavailable. Ask Clutch to convert this to a Google Doc for full reading support.]'
      }
    }

    // ── .docx → download binary and extract XML text ──────────────────────
    else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      fileName.endsWith('.docx')
    ) {
      const downloadRes = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'arraybuffer' }
      )
      const buffer = Buffer.from(downloadRes.data as ArrayBuffer)
      content = extractTextFromDocx(buffer)
      if (!content || content.length < 10) {
        content = '[Could not extract text from this .docx file. Try converting it to a Google Doc in Drive for better reading support.]'
      }
    }

    // ── Plain text, markdown, CSV, JSON ───────────────────────────────────
    else if (
      mimeType.startsWith('text/') ||
      mimeType === 'application/json' ||
      fileName.endsWith('.md') ||
      fileName.endsWith('.txt') ||
      fileName.endsWith('.csv')
    ) {
      const downloadRes = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'arraybuffer' }
      )
      content = Buffer.from(downloadRes.data as ArrayBuffer).toString('utf8').slice(0, 10000)
    }

    // ── Unsupported format ─────────────────────────────────────────────────
    else {
      content = `[File type "${mimeType}" is not supported for text reading. Supported types: Google Docs, .docx, PDF, Google Sheets, Google Slides, plain text, markdown, CSV.]`
    }

    const truncated = content.length >= 10000
    const finalContent = truncated
      ? content.slice(0, 10000) + '\n\n[Content truncated at 10,000 characters — ask for a specific section if you need more.]'
      : content

    console.log(`[drive] Read "${fileName}": ${finalContent.length} chars${truncated ? ' (truncated)' : ''}`)

    return {
      tool: 'read_drive_file',
      success: true,
      timestamp,
      data: {
        content: finalContent,
        title: fileName,
        mimeType,
        fileId,
      },
    }
  } catch (err) {
    return {
      tool: 'read_drive_file',
      success: false,
      timestamp,
      data: empty,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
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

// ─── Elara Workspace tools ────────────────────────────────────────────────

async function isInElaraWorkspace(
  drive: ReturnType<typeof google.drive>,
  fileId: string
): Promise<boolean> {
  const workspaceFolderId = process.env.GOOGLE_DRIVE_ELARA_FOLDER_ID
  if (!workspaceFolderId) return false
  try {
    const res = await drive.files.get({ fileId, fields: 'parents' })
    const parents = res.data.parents || []
    if (parents.includes(workspaceFolderId)) return true
    for (const parentId of parents) {
      const parentRes = await drive.files.get({ fileId: parentId, fields: 'parents' })
      if ((parentRes.data.parents || []).includes(workspaceFolderId)) return true
    }
    return false
  } catch { return false }
}

export async function copyToWorkspace(
  sourceFileId: string,
  reason?: string
): Promise<ToolResult<{ copyId: string; copyUrl: string; title: string }>> {
  const timestamp = new Date().toISOString()
  const empty = { copyId: '', copyUrl: '', title: '' }
  if (!isGoogleConfigured()) return { tool: 'copy_to_workspace', success: false, timestamp, data: empty, error: 'Google OAuth not configured.' }
  const workspaceFolderId = process.env.GOOGLE_DRIVE_ELARA_FOLDER_ID
  if (!workspaceFolderId) return { tool: 'copy_to_workspace', success: false, timestamp, data: empty, error: 'GOOGLE_DRIVE_ELARA_FOLDER_ID not set.' }
  try {
    const auth = createOAuthClient()
    const drive = google.drive({ version: 'v3', auth })
    const meta = await drive.files.get({ fileId: sourceFileId, fields: 'name, mimeType' })
    const originalName = meta.data.name || 'Document'
    const copyTitle = `[ELARA COPY] ${originalName} — ${new Date().toLocaleDateString()}`
    const subfolderRes = await drive.files.list({
      q: `'${workspaceFolderId}' in parents and name = 'Working Copies' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id)',
    })
    const workingCopiesFolderId = subfolderRes.data.files?.[0]?.id || workspaceFolderId
    const copy = await drive.files.copy({
      fileId: sourceFileId,
      requestBody: { name: copyTitle, parents: [workingCopiesFolderId] },
      fields: 'id, name, webViewLink',
    })
    const copyId = copy.data.id || ''
    const copyUrl = copy.data.webViewLink || `https://docs.google.com/document/d/${copyId}/edit`
    console.log(`[drive] Copied "${originalName}" to workspace: ${copyId}${reason ? ` — ${reason}` : ''}`)
    return { tool: 'copy_to_workspace', success: true, timestamp, data: { copyId, copyUrl, title: copyTitle } }
  } catch (err) { return { tool: 'copy_to_workspace', success: false, timestamp, data: empty, error: err instanceof Error ? err.message : 'Unknown' } }
}

export async function writeWorkspaceDoc(
  fileId: string,
  newContent: string,
  summary?: string
): Promise<ToolResult<{ fileId: string; url: string; summary?: string }>> {
  const timestamp = new Date().toISOString()
  const empty = { fileId, url: '' }
  if (!isGoogleConfigured()) return { tool: 'write_workspace_doc', success: false, timestamp, data: empty, error: 'Google OAuth not configured.' }
  if (!process.env.GOOGLE_DRIVE_ELARA_FOLDER_ID) return { tool: 'write_workspace_doc', success: false, timestamp, data: empty, error: 'GOOGLE_DRIVE_ELARA_FOLDER_ID not set.' }
  try {
    const auth = createOAuthClient()
    const drive = google.drive({ version: 'v3', auth })
    const docs = google.docs({ version: 'v1', auth })
    const inWorkspace = await isInElaraWorkspace(drive, fileId)
    if (!inWorkspace) {
      console.error(`[drive] BLOCKED write attempt to file outside workspace: ${fileId}`)
      return { tool: 'write_workspace_doc', success: false, timestamp, data: empty, error: 'Write blocked — this file is not inside the Elara Workspace folder.' }
    }
    const currentDoc = await docs.documents.get({ documentId: fileId })
    const docLength = currentDoc.data.body?.content?.reduce((len, el) => {
      if (el.paragraph) return len + el.paragraph.elements!.reduce((pLen, pe) => pLen + (pe.textRun?.content?.length || 0), 0)
      return len
    }, 0) || 1
    const requests: Array<Record<string, unknown>> = []
    if (docLength > 1) requests.push({ deleteContentRange: { range: { startIndex: 1, endIndex: docLength } } })
    requests.push({ insertText: { location: { index: 1 }, text: newContent } })
    await docs.documents.batchUpdate({ documentId: fileId, requestBody: { requests } })
    const url = `https://docs.google.com/document/d/${fileId}/edit`
    console.log(`[drive] Updated workspace doc: ${fileId}${summary ? ` — ${summary}` : ''}`)
    return { tool: 'write_workspace_doc', success: true, timestamp, data: { fileId, url, summary } }
  } catch (err) { return { tool: 'write_workspace_doc', success: false, timestamp, data: empty, error: err instanceof Error ? err.message : 'Unknown' } }
}

export async function moveToReview(
  fileId: string,
  reviewNote: string
): Promise<ToolResult<{ fileId: string; url: string }>> {
  const timestamp = new Date().toISOString()
  const empty = { fileId, url: '' }
  if (!isGoogleConfigured()) return { tool: 'move_to_review', success: false, timestamp, data: empty, error: 'Google OAuth not configured.' }
  const workspaceFolderId = process.env.GOOGLE_DRIVE_ELARA_FOLDER_ID
  if (!workspaceFolderId) return { tool: 'move_to_review', success: false, timestamp, data: empty, error: 'GOOGLE_DRIVE_ELARA_FOLDER_ID not set.' }
  try {
    const auth = createOAuthClient()
    const drive = google.drive({ version: 'v3', auth })
    const inWorkspace = await isInElaraWorkspace(drive, fileId)
    if (!inWorkspace) return { tool: 'move_to_review', success: false, timestamp, data: empty, error: 'Move blocked — file is not inside the Elara Workspace folder.' }
    const subfolderRes = await drive.files.list({
      q: `'${workspaceFolderId}' in parents and name = 'Ready for Review' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id)',
    })
    const reviewFolderId = subfolderRes.data.files?.[0]?.id
    if (!reviewFolderId) return { tool: 'move_to_review', success: false, timestamp, data: empty, error: 'Ready for Review subfolder not found in Elara Workspace.' }
    const fileMeta = await drive.files.get({ fileId, fields: 'parents' })
    const currentParents = (fileMeta.data.parents || []).join(',')
    await drive.files.update({ fileId, addParents: reviewFolderId, removeParents: currentParents, fields: 'id, parents' })
    const url = `https://docs.google.com/document/d/${fileId}/edit`
    console.log(`[drive] Moved to review: ${fileId} — ${reviewNote}`)
    return { tool: 'move_to_review', success: true, timestamp, data: { fileId, url } }
  } catch (err) { return { tool: 'move_to_review', success: false, timestamp, data: empty, error: err instanceof Error ? err.message : 'Unknown' } }
}

export const copyToWorkspaceTool: AgentTool = {
  name: 'copy_to_workspace',
  description:
    'Copy any Google Drive file into the Elara Workspace folder for editing. ' +
    'Always copy before editing — never modify originals. ' +
    'Use when asked to update a document: copy it first, then use write_workspace_doc on the copy. ' +
    'Returns the copy\'s file ID and URL.',
  input_schema: {
    type: 'object',
    properties: {
      sourceFileId: { type: 'string', description: 'File ID of the original document to copy.' },
      reason: { type: 'string', description: 'Why this copy is being made — logged for auditability.' },
    },
    required: ['sourceFileId'],
  },
  execute: async (input) => copyToWorkspace(input.sourceFileId as string, input.reason as string | undefined),
}

export const writeWorkspaceDocTool: AgentTool = {
  name: 'write_workspace_doc',
  description:
    'Write new content to a Google Doc inside the Elara Workspace folder. ' +
    'ONLY works on files inside the Elara Workspace — all others are hard-blocked. ' +
    'Always use copy_to_workspace first if editing an original document. ' +
    'After writing, use move_to_review to signal the work is ready for Clutch to verify.',
  input_schema: {
    type: 'object',
    properties: {
      fileId: { type: 'string', description: 'File ID of the workspace document to update.' },
      newContent: { type: 'string', description: 'Complete new content for the document. Replaces all existing content.' },
      summary: { type: 'string', description: 'Brief description of what was changed — logged for auditability.' },
    },
    required: ['fileId', 'newContent'],
  },
  execute: async (input) => writeWorkspaceDoc(input.fileId as string, input.newContent as string, input.summary as string | undefined),
}

export const moveToReviewTool: AgentTool = {
  name: 'move_to_review',
  description:
    'Move a completed workspace document to the Ready for Review folder. ' +
    'Use after finishing edits to signal the work is ready for Clutch to verify. ' +
    'Clutch reviews, approves, and moves the file to its final location.',
  input_schema: {
    type: 'object',
    properties: {
      fileId: { type: 'string', description: 'File ID of the workspace document to move to review.' },
      reviewNote: { type: 'string', description: 'Summary of what was done and what Clutch should look for.' },
    },
    required: ['fileId', 'reviewNote'],
  },
  execute: async (input) => moveToReview(input.fileId as string, input.reviewNote as string),
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

export const readDriveFileTool: AgentTool = {
  name: 'read_drive_file',
  description:
    'Read the content of ANY file in Google Drive — works with Google Docs, .docx files, ' +
    'PDFs, Google Sheets, Google Slides, plain text, markdown, and CSV. ' +
    'Use this instead of read_google_doc when the file might be a .docx or non-Google format. ' +
    'When Clutch asks to read a document, use search_drive_file first to get the file ID, ' +
    'then call this tool with that ID. ' +
    'Supported: Google Docs, .docx, PDF (if text layer exists), Sheets (as CSV), ' +
    'Slides (as text), .txt, .md, .csv, .json.',
  input_schema: {
    type: 'object',
    properties: {
      fileId: {
        type: 'string',
        description: 'Google Drive file ID. Get this from search_drive_file or list_drive_files.',
      },
    },
    required: ['fileId'],
  },
  execute: async (input) => readDriveFile(input.fileId as string),
}
