/**
 * One-time Google OAuth2 setup
 * Run: npm run google-auth
 *
 * Uses localhost redirect (Google no longer supports OOB flow).
 * The script starts a temporary server on port 3001 to catch the auth code.
 */
import { google } from 'googleapis'
import { createServer } from 'http'

const PORT = 3001
const REDIRECT_URI = `http://localhost:${PORT}`

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/drive.file',        // create new files only
  'https://www.googleapis.com/auth/documents',          // read + write docs we create
  'https://www.googleapis.com/auth/drive.readonly',     // read existing files
  'https://www.googleapis.com/auth/documents.readonly',
]

async function main() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first.')
    process.exit(1)
  }

  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI)
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  })

  console.log('\n\uD83D\uDD10 ELARA \u2014 GOOGLE AUTH SETUP\n')
  console.log('Scopes: Gmail (read), Calendar (read), Drive (create new files), Docs (read + write drafts)\n')
  console.log('Opening auth URL. If it does not open automatically, paste this in your browser:\n')
  console.log(authUrl)
  console.log('\nWaiting for authorization on http://localhost:' + PORT + ' ...\n')

  // Start a temporary local server to catch the redirect
  await new Promise<void>((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url!, `http://localhost:${PORT}`)
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<h2>Authorization failed.</h2><p>You can close this tab.</p>')
        server.close()
        reject(new Error(`OAuth error: ${error}`))
        return
      }

      if (!code) {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<h2>No code received.</h2>')
        return
      }

      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<h2>\u2705 Authorized!</h2><p>You can close this tab and return to your terminal.</p>')
      server.close()

      try {
        const { tokens } = await oAuth2Client.getToken(code)
        console.log('\u2705 Authorized! Add this to your .env and Railway:\n')
        console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`)
        console.log('\nDone.')
        resolve()
      } catch (err) {
        reject(err)
      }
    })

    server.listen(PORT, () => {
      // Try to open the URL in the default browser (Windows)
      import('child_process').then(({ exec }) => {
        exec(`start "" "${authUrl}"`)
      }).catch(() => {
        // If auto-open fails, user already has the URL printed above
      })
    })

    server.on('error', reject)
  })
}

main().catch((err) => {
  console.error('Auth failed:', err)
  process.exit(1)
})
