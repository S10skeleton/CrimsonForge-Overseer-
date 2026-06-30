/**
 * Branded transactional email (STEP7). Inline CSS only (email clients).
 * Crimson header bar, white card on light gray, one primary button, plain-text
 * fallback. Logo via BRAND_LOGO_URL (fallback to the marketing site).
 */

const ACCENT = '#C0302A'
const LOGO = process.env.BRAND_LOGO_URL || 'https://crimsonforge.pro/logo.png'

interface Built { subject: string; html: string; text: string }

function shell(opts: { heading: string; bodyHtml: string; buttonLabel: string; buttonUrl: string; footnote?: string }): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1d23;">
  <div style="max-width:520px;margin:0 auto;padding:24px 16px;">
    <div style="background:#ffffff;border:1px solid #d8dde5;border-radius:12px;overflow:hidden;">
      <div style="background:${ACCENT};padding:16px 24px;">
        <img src="${LOGO}" alt="Crimson Forge" height="22" style="height:22px;vertical-align:middle;" />
        <span style="color:#ffffff;font-weight:700;font-size:14px;letter-spacing:1px;margin-left:8px;vertical-align:middle;">CRIMSON FORGE · OVERSEER</span>
      </div>
      <div style="padding:28px 24px;">
        <h1 style="margin:0 0 12px;font-size:20px;color:#1a1d23;">${opts.heading}</h1>
        <div style="font-size:14px;line-height:1.6;color:#565d6b;">${opts.bodyHtml}</div>
        <div style="margin:26px 0 8px;">
          <a href="${opts.buttonUrl}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 22px;border-radius:8px;">${opts.buttonLabel}</a>
        </div>
        ${opts.footnote ? `<div style="font-size:12.5px;color:#8f97a3;margin-top:14px;">${opts.footnote}</div>` : ''}
      </div>
    </div>
    <div style="text-align:center;font-size:11.5px;color:#8f97a3;padding:14px 8px;">
      Crimson Forge Overseer · if you weren't expecting this, you can ignore it.
    </div>
  </div></body></html>`
}

export function inviteEmail(opts: { name?: string; inviterName?: string; acceptUrl: string; expiresHours: number }): Built {
  const who = opts.name ? `Hi ${opts.name},` : 'Hi,'
  const by = opts.inviterName ? ` by ${opts.inviterName}` : ''
  return {
    subject: 'You\'ve been invited to Crimson Forge Overseer',
    html: shell({
      heading: 'You\'re invited to Overseer',
      bodyHtml: `${who}<br/><br/>You've been invited${by} to the Crimson Forge Overseer panel. Set your password to activate your account.`,
      buttonLabel: 'Set your password',
      buttonUrl: opts.acceptUrl,
      footnote: `This invite link expires in ${opts.expiresHours} hours. If the button doesn't work, paste this into your browser:<br/><a href="${opts.acceptUrl}" style="color:${ACCENT};">${opts.acceptUrl}</a>`,
    }),
    text: `${who}\n\nYou've been invited${by} to the Crimson Forge Overseer panel.\nSet your password (link valid ${opts.expiresHours}h):\n${opts.acceptUrl}\n\nIf you weren't expecting this, ignore it.`,
  }
}

export function resetEmail(opts: { name?: string; resetUrl: string }): Built {
  const who = opts.name ? `Hi ${opts.name},` : 'Hi,'
  return {
    subject: 'Reset your Crimson Forge Overseer password',
    html: shell({
      heading: 'Reset your password',
      bodyHtml: `${who}<br/><br/>A password reset was requested for your Overseer account.`,
      buttonLabel: 'Reset password',
      buttonUrl: opts.resetUrl,
      footnote: `This link expires in 30 minutes. If you didn't request it, you can ignore this email.`,
    }),
    text: `${who}\n\nA password reset was requested for your Overseer account.\nReset link (valid 30 min):\n${opts.resetUrl}\n\nIf you didn't request this, ignore it.`,
  }
}
