/**
 * TOTP (RFC 6238) + recovery codes for panel 2FA (STEP8).
 * Secrets are AES-256-GCM encrypted at rest (MFA_ENC_KEY); recovery codes are
 * stored as sha256 hashes. Standard otpauth:// — works with any authenticator.
 */

import crypto from 'crypto'
import { generateSecret, generateURI, verify } from 'otplib'
import QRCode from 'qrcode'

const ISSUER = 'Crimson Forge Overseer'

export function generateTotpSecret(): string {
  return generateSecret()
}

export function otpauthUrl(secret: string, account: string): string {
  return generateURI({ secret, label: account, issuer: ISSUER })
}

export async function qrDataUrl(otpauth: string): Promise<string> {
  return QRCode.toDataURL(otpauth)
}

/** Verify a 6-digit token against the secret (±1 step / 30s skew). */
export async function verifyToken(secret: string, token: string): Promise<boolean> {
  try {
    const result = await verify({ token: String(token).trim(), secret, epochTolerance: 30 })
    return Boolean((result as { valid?: boolean }).valid)
  } catch {
    return false
  }
}

// ─── Encryption at rest (AES-256-GCM) ────────────────────────────────────────
function encKey(): Buffer {
  // Derive a 32-byte key from MFA_ENC_KEY. Required env (see index.ts) — never a
  // hardcoded default, or secrets would be encrypted under a key in the source.
  const k = process.env.MFA_ENC_KEY
  if (!k) throw new Error('MFA_ENC_KEY is not set')
  return crypto.createHash('sha256').update(k).digest()
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`
}

export function decryptSecret(stored: string): string {
  const [ivb, tagb, encb] = stored.split(':')
  const decipher = crypto.createDecipheriv('aes-256-gcm', encKey(), Buffer.from(ivb, 'base64'))
  decipher.setAuthTag(Buffer.from(tagb, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(encb, 'base64')), decipher.final()]).toString('utf8')
}

// ─── Recovery codes ──────────────────────────────────────────────────────────
function normalizeCode(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function hashRecoveryCode(code: string): string {
  return crypto.createHash('sha256').update(normalizeCode(code)).digest('hex')
}

/** Generate display codes (xxxxx-xxxxx) + their sha256 hashes (stored). */
export function genRecoveryCodes(n = 10): { plain: string[]; hashes: string[] } {
  const plain: string[] = []
  const hashes: string[] = []
  for (let i = 0; i < n; i++) {
    const raw = crypto.randomBytes(5).toString('hex') // 10 hex chars
    const code = `${raw.slice(0, 5)}-${raw.slice(5)}`
    plain.push(code)
    hashes.push(hashRecoveryCode(code))
  }
  return { plain, hashes }
}
