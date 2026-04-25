import { Metadata } from 'next'
import { ReferralPageClient } from './referral-client'

export const metadata: Metadata = {
  title: 'Empfehlen & Sparen | Belegmanager',
  description: 'Empfehle Belegmanager weiter und erhalte pro erfolgreicher Empfehlung einen Gratismonat.',
}

export default function ReferralPage() {
  return <ReferralPageClient />
}
