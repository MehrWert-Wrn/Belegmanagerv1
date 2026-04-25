'use client'

import { useState } from 'react'
import { Copy, Check, Link2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ShareButtons } from './share-buttons'
import { toast } from 'sonner'

interface LinkCardProps {
  referralLink: string
  loading?: boolean
}

export function LinkCard({ referralLink, loading = false }: LinkCardProps) {
  const [copied, setCopied] = useState(false)

  async function copyLink() {
    if (!referralLink) return
    try {
      await navigator.clipboard.writeText(referralLink)
      setCopied(true)
      toast.success('Link kopiert')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Link konnte nicht kopiert werden')
    }
  }

  return (
    <Card className="border-teal-100">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Link2 className="h-4 w-4 text-teal-600" aria-hidden="true" />
          Dein persönlicher Empfehlungs-Link
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={loading ? 'Lade…' : referralLink}
            readOnly
            aria-label="Persönlicher Empfehlungs-Link"
            className="flex-1 bg-muted/40 font-mono text-sm"
            onFocus={(e) => e.target.select()}
          />
          <Button
            onClick={copyLink}
            disabled={loading || !referralLink}
            className="bg-teal-600 hover:bg-teal-700"
          >
            {copied ? (
              <>
                <Check className="mr-2 h-4 w-4" />
                Kopiert
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" />
                Kopieren
              </>
            )}
          </Button>
        </div>
        <ShareButtons referralLink={referralLink} disabled={loading || !referralLink} />
        <p className="text-xs text-muted-foreground">
          Pro erfolgreicher Empfehlung erhältst du{' '}
          <strong className="text-teal-700">39,90 €</strong> Guthaben – das entspricht einem
          kostenlosen Monat Belegmanager.
        </p>
      </CardContent>
    </Card>
  )
}
