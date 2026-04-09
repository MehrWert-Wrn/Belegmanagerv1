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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
