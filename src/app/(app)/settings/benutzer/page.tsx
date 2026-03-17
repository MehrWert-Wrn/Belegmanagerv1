'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { UserPlus } from 'lucide-react'
import type { BenutzerListItem } from '@/lib/supabase/types'
import { BenutzerTabelle } from '@/components/benutzer/benutzer-tabelle'
import { EinladungsDialog } from '@/components/benutzer/einladungs-dialog'

export default function BenutzerSettingsPage() {
  const router = useRouter()
  const [users, setUsers] = useState<BenutzerListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showInviteDialog, setShowInviteDialog] = useState(false)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/benutzer')

      if (res.status === 403) {
        // Not an admin - redirect to dashboard
        router.push('/dashboard')
        return
      }

      if (res.status === 401) {
        router.push('/login')
        return
      }

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Fehler beim Laden der Benutzer')
        setLoading(false)
        return
      }

      const data = await res.json()
      setUsers(data.data ?? [])
    } catch {
      setError('Netzwerkfehler')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  if (loading && users.length === 0) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72 mt-1" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Benutzerverwaltung</CardTitle>
            <CardDescription className="mt-1">
              Verwalte die Benutzer und Rollen deines Mandanten
            </CardDescription>
          </div>
          <Button onClick={() => setShowInviteDialog(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Benutzer einladen
          </Button>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="rounded-md bg-destructive/10 text-destructive text-sm px-3 py-2 mb-4">
              {error}
            </div>
          )}
          <BenutzerTabelle
            users={users}
            loading={loading}
            onRefresh={fetchUsers}
          />
        </CardContent>
      </Card>

      <EinladungsDialog
        open={showInviteDialog}
        onOpenChange={setShowInviteDialog}
        onSuccess={fetchUsers}
      />
    </>
  )
}
