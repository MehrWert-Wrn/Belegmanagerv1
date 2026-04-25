import { Resend } from 'resend'

let resendInstance: Resend | null = null

function getResend(): Resend {
  if (!resendInstance) {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      throw new Error('Missing RESEND_API_KEY environment variable')
    }
    resendInstance = new Resend(apiKey)
  }
  return resendInstance
}

const SENDER = 'Belegmanager Support <noreply@belegmanager.at>'

function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
}

/**
 * Send email notification when an admin replies to a support ticket.
 */
export async function sendTicketReplyEmail(params: {
  recipientEmail: string
  ticketId: string
  ticketSubject: string
  messageText: string
}): Promise<void> {
  const { recipientEmail, ticketId, ticketSubject, messageText } = params
  const ticketUrl = `${getSiteUrl()}/support/tickets/${ticketId}`

  try {
    const resend = getResend()
    await resend.emails.send({
      from: SENDER,
      to: recipientEmail,
      subject: `[Belegmanager Support] Antwort zu: ${ticketSubject}`,
      html: `
        <div style="font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #0d9488;">Neue Antwort zu Ihrem Ticket</h2>
          <p style="color: #374151;">Betreff: <strong>${escapeHtml(ticketSubject)}</strong></p>
          <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <p style="color: #374151; white-space: pre-wrap;">${escapeHtml(messageText)}</p>
          </div>
          <p>
            <a href="${ticketUrl}" style="display: inline-block; background: #0d9488; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none;">
              Ticket ansehen
            </a>
          </p>
          <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
            Belegmanager - Buchhaltungsvorbereitung fuer oesterreichische KMUs
          </p>
        </div>
      `,
    })
  } catch (error) {
    console.error('[Resend] Failed to send ticket reply email:', error)
    // Do not throw - email failure should not block the ticket action
  }
}

/**
 * Send email notification when a ticket status changes.
 */
export async function sendTicketStatusEmail(params: {
  recipientEmail: string
  ticketId: string
  ticketSubject: string
  newStatus: string
}): Promise<void> {
  const { recipientEmail, ticketId, ticketSubject, newStatus } = params
  const ticketUrl = `${getSiteUrl()}/support/tickets/${ticketId}`

  const statusLabels: Record<string, string> = {
    open: 'geoeffnet',
    in_progress: 'in Bearbeitung genommen',
    closed: 'geschlossen',
  }

  const statusLabel = statusLabels[newStatus] || newStatus

  try {
    const resend = getResend()
    await resend.emails.send({
      from: SENDER,
      to: recipientEmail,
      subject: `[Belegmanager Support] Ihr Ticket wurde ${statusLabel}`,
      html: `
        <div style="font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #0d9488;">Ticket-Status aktualisiert</h2>
          <p style="color: #374151;">Betreff: <strong>${escapeHtml(ticketSubject)}</strong></p>
          <p style="color: #374151;">Neuer Status: <strong>${escapeHtml(statusLabel)}</strong></p>
          <p>
            <a href="${ticketUrl}" style="display: inline-block; background: #0d9488; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none;">
              Ticket ansehen
            </a>
          </p>
          <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
            Belegmanager - Buchhaltungsvorbereitung fuer oesterreichische KMUs
          </p>
        </div>
      `,
    })
  } catch (error) {
    console.error('[Resend] Failed to send ticket status email:', error)
  }
}

/**
 * Send notification to office when a mandant submits email credentials (PROJ-24).
 * Does NOT include any credential values – only metadata.
 */
export async function sendCredentialNotificationEmail(params: {
  firmenname: string
  provider: string
  submittedAt: string
}): Promise<void> {
  const { firmenname, provider, submittedAt } = params

  const providerLabels: Record<string, string> = {
    imap: 'IMAP',
    microsoft365: 'Microsoft 365',
    gmail: 'Gmail',
  }
  const providerLabel = providerLabels[provider] || provider

  const formattedDate = new Date(submittedAt).toLocaleString('de-AT', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Vienna',
  })

  try {
    const resend = getResend()
    await resend.emails.send({
      from: SENDER,
      to: 'office@online-mehrwert.at',
      subject: `[Belegmanager] Neue Zugangsdaten von ${firmenname}`,
      html: `
        <div style="font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #0d9488;">Neue E-Mail-Zugangsdaten eingegangen</h2>
          <table style="border-collapse: collapse; margin: 16px 0;">
            <tr>
              <td style="padding: 8px 16px 8px 0; color: #6b7280;">Firma:</td>
              <td style="padding: 8px 0; color: #374151; font-weight: 600;">${escapeHtml(firmenname)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 16px 8px 0; color: #6b7280;">Anbieter:</td>
              <td style="padding: 8px 0; color: #374151; font-weight: 600;">${escapeHtml(providerLabel)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 16px 8px 0; color: #6b7280;">Zeitpunkt:</td>
              <td style="padding: 8px 0; color: #374151;">${escapeHtml(formattedDate)}</td>
            </tr>
          </table>
          <p style="color: #374151;">
            Bitte im Admin-Panel die Zugangsdaten einsehen und die E-Mail-Anbindung einrichten.
          </p>
          <p>
            <a href="${getSiteUrl()}/admin" style="display: inline-block; background: #0d9488; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none;">
              Zum Admin-Panel
            </a>
          </p>
          <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
            Belegmanager - Buchhaltungsvorbereitung fuer oesterreichische KMUs
          </p>
        </div>
      `,
    })
  } catch (error) {
    console.error('[Resend] Failed to send credential notification email:', error)
    // Do not throw - email failure should not block the submission
  }
}

/**
 * PROJ-31: Notification an Referrer, dass die Empfehlung zahlender Kunde geworden ist.
 */
export async function sendReferralPendingEmail(params: {
  recipientEmail: string
  referredEmailMasked: string
}): Promise<void> {
  const { recipientEmail, referredEmailMasked } = params
  const referralUrl = `${getSiteUrl()}/referral`

  try {
    const resend = getResend()
    await resend.emails.send({
      from: SENDER,
      to: recipientEmail,
      subject: 'Deine Empfehlung ist zahlender Belegmanager-Kunde',
      html: `
        <div style="font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #0d9488;">Deine Empfehlung zahlt</h2>
          <p style="color: #374151;">
            Gute Nachricht: <strong>${escapeHtml(referredEmailMasked)}</strong> hat ein
            kostenpflichtiges Belegmanager-Abo abgeschlossen.
          </p>
          <p style="color: #374151;">
            In <strong>14 Tagen</strong> schreiben wir dir automatisch
            <strong>39,90 &euro; Guthaben</strong> gut – das entspricht einem Gratismonat.
            Voraussetzung ist, dass das Abo bis dahin aktiv bleibt.
          </p>
          <p>
            <a href="${referralUrl}" style="display: inline-block; background: #0d9488; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none;">
              Empfehlungen ansehen
            </a>
          </p>
          <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
            Belegmanager - Buchhaltungsvorbereitung fuer oesterreichische KMUs
          </p>
        </div>
      `,
    })
  } catch (error) {
    console.error('[Resend] Failed to send referral pending email:', error)
  }
}

/**
 * PROJ-31: Notification an Referrer, dass das Reward (39,90 EUR) gutgeschrieben wurde.
 */
export async function sendReferralRewardedEmail(params: {
  recipientEmail: string
  referredEmailMasked: string
}): Promise<void> {
  const { recipientEmail, referredEmailMasked } = params
  const referralUrl = `${getSiteUrl()}/referral`

  try {
    const resend = getResend()
    await resend.emails.send({
      from: SENDER,
      to: recipientEmail,
      subject: 'Dein Gratismonat wurde gutgeschrieben – 39,90 € Guthaben',
      html: `
        <div style="font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #0d9488;">Dein Gratismonat ist da</h2>
          <p style="color: #374151;">
            Wir haben dir soeben <strong>39,90 &euro;</strong> Stripe-Guthaben gutgeschrieben –
            ein kompletter Gratismonat als Dankeschoen fuer deine Empfehlung
            (<strong>${escapeHtml(referredEmailMasked)}</strong>).
          </p>
          <p style="color: #374151;">
            Das Guthaben wird automatisch mit deiner naechsten Rechnung verrechnet.
          </p>
          <p>
            <a href="${referralUrl}" style="display: inline-block; background: #0d9488; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none;">
              Zu meinen Empfehlungen
            </a>
          </p>
          <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
            Belegmanager - Buchhaltungsvorbereitung fuer oesterreichische KMUs
          </p>
        </div>
      `,
    })
  } catch (error) {
    console.error('[Resend] Failed to send referral rewarded email:', error)
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
