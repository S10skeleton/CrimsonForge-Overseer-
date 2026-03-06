/**
 * Google OAuth2 shared client
 * Used by Gmail, Calendar, and Drive tools
 */

import { google } from 'googleapis'

export function createOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Missing Google OAuth credentials. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN.'
    )
  }

  const client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'http://localhost:3001'
  )

  client.setCredentials({ refresh_token: refreshToken })
  return client
}

export function isGoogleConfigured(): boolean {
  return !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN
  )
}
