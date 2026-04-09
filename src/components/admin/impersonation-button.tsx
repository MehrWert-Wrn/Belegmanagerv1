'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { UserCheck, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface ImpersonationButtonProps {
  mandantId: string
  mandantName: string
}

export function ImpersonationButton({ mandantId, mandantName }: ImpersonationButtonProps) {
  const [loading, setLoading] = useState(false)

  async function handleStart() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/impersonation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mandant_id: mandantId }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Impersonation konnte nicht gestartet werden')
      }

      toast.success(`Impersonation als ${mandantName} gestartet`)
      // Full page redirect to dashboard (as mandant)
      window.location.href = '/dashboard'
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unbekannter Fehler')
      setLoading(false)
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={loading}>
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <UserCheck className="mr-2 h-4 w-4" />
          )}
          Als Mandant einloggen
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Als Mandant einloggen?</AlertDialogTitle>
          <AlertDialogDescription>
            Du wirst als <strong>{mandantName}</strong> eingeloggt und siehst die App aus dessen Perspektive.
            Ein Banner zeigt den Admin-Modus an. Die Session wird im Audit-Log protokolliert.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction onClick={handleStart}>
            Impersonation starten
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
