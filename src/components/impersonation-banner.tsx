'use client'

import { useState } from 'react'
import { Shield, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ImpersonationBannerProps {
  mandantName: string
}

export function ImpersonationBanner({ mandantName }: ImpersonationBannerProps) {
  const [ending, setEnding] = useState(false)

  async function handleEndSession() {
    setEnding(true)
    try {
      await fetch('/api/admin/impersonation', { method: 'DELETE' })
      window.location.href = '/admin/mandanten'
    } catch {
      setEnding(false)
    }
  }

  return (
    <div className="sticky top-0 z-50 flex items-center justify-between gap-3 bg-purple-600 px-4 py-2 text-white shadow-md">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Shield className="h-4 w-4" />
        <span>Admin-Modus: {mandantName}</span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleEndSession}
        disabled={ending}
        className="text-white hover:bg-purple-700 hover:text-white"
      >
        {ending ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <X className="mr-1.5 h-3.5 w-3.5" />
        )}
        Session beenden
      </Button>
    </div>
  )
}
