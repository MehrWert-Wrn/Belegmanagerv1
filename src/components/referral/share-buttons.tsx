'use client'

import { Mail, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ShareButtonsProps {
  referralLink: string
  disabled?: boolean
}

const SHARE_MESSAGE =
  'Hi! Ich nutze Belegmanager für meine Buchhaltungsvorbereitung – das spart wirklich Zeit. Wenn du dich über meinen Link anmeldest, bekommen wir beide einen Vorteil: '

export function ShareButtons({ referralLink, disabled = false }: ShareButtonsProps) {
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(SHARE_MESSAGE + referralLink)}`
  const emailSubject = encodeURIComponent('Belegmanager – meine Empfehlung für dich')
  const emailBody = encodeURIComponent(SHARE_MESSAGE + referralLink)
  const mailtoUrl = `mailto:?subject=${emailSubject}&body=${emailBody}`

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        asChild
        disabled={disabled}
        className="border-teal-200 text-teal-700 hover:bg-teal-50 hover:text-teal-800"
      >
        <a
          href={disabled ? undefined : whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Per WhatsApp teilen"
        >
          <MessageCircle className="mr-2 h-4 w-4" aria-hidden="true" />
          WhatsApp
        </a>
      </Button>
      <Button
        variant="outline"
        size="sm"
        asChild
        disabled={disabled}
        className="border-teal-200 text-teal-700 hover:bg-teal-50 hover:text-teal-800"
      >
        <a href={disabled ? undefined : mailtoUrl} aria-label="Per E-Mail teilen">
          <Mail className="mr-2 h-4 w-4" aria-hidden="true" />
          E-Mail
        </a>
      </Button>
    </div>
  )
}
