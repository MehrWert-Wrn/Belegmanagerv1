'use client'

import { useState } from 'react'
import type { BenutzerListItem } from '@/lib/supabase/types'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { MoreHorizontal, UserX, RefreshCw, Shield, KeyRound } from 'lucide-react'
import { RolleAendernDialog } from './rolle-aendern-dialog'
import { PasswortAendernDialog } from './passwort-aendern-dialog'

interface BenutzerTabelleProps {
  users: BenutzerListItem[]
  loading: boolean
  onRefresh: () => void
  currentUserId?: string | null
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function StatusBadge({ user }: { user: BenutzerListItem }) {
  if (!user.einladung_angenommen_am) {
    return (
      <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100">
        Ausstehend
      </Badge>
    )
  }
  if (!user.aktiv) {
    return (
      <Badge className="bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-100">
        Inaktiv
      </Badge>
    )
  }
  return (
    <Badge className="bg-teal-100 text-teal-800 border-teal-200 hover:bg-teal-100">
      Aktiv
    </Badge>
  )
}

function RolleBadge({ rolle }: { rolle: string }) {
  if (rolle === 'admin') {
    return (
      <Badge className="bg-teal-100 text-teal-800 border-teal-200 hover:bg-teal-100">
        Admin
      </Badge>
    )
  }
  return (
    <Badge className="bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100">
      Buchhalter
    </Badge>
  )
}

export function BenutzerTabelle({ users, loading, onRefresh, currentUserId }: BenutzerTabelleProps) {
  const [rolleDialogUser, setRolleDialogUser] = useState<BenutzerListItem | null>(null)
  const [showPasswortDialog, setShowPasswortDialog] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  async function handleStatusToggle(user: BenutzerListItem) {
    setActionLoading(user.id)
    try {
      const res = await fetch(`/api/benutzer/${user.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aktiv: !user.aktiv }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Fehler beim Aktualisieren des Status')
      } else {
        onRefresh()
      }
    } catch {
      alert('Netzwerkfehler')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleResendInvite(user: BenutzerListItem) {
    setActionLoading(user.id)
    try {
      const res = await fetch(`/api/benutzer/${user.id}/einladung-erneut`, {
        method: 'POST',
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Fehler beim erneuten Senden der Einladung')
      } else {
        alert('Einladung wurde erneut gesendet')
      }
    } catch {
      alert('Netzwerkfehler')
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
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
    )
  }

  if (users.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>Noch keine Benutzer vorhanden.</p>
        <p className="text-sm mt-1">Laden Sie Benutzer ein, um loszulegen.</p>
      </div>
    )
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>E-Mail</TableHead>
            <TableHead>Rolle</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Eingeladen am</TableHead>
            <TableHead>Angenommen am</TableHead>
            <TableHead className="w-[60px]">Aktionen</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium">
                {user.name ?? <span className="text-muted-foreground">-</span>}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{user.email}</TableCell>
              <TableCell>
                <RolleBadge rolle={user.rolle} />
              </TableCell>
              <TableCell>
                <StatusBadge user={user} />
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDate(user.eingeladen_am)}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDate(user.einladung_angenommen_am)}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={actionLoading === user.id}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setRolleDialogUser(user)}>
                      <Shield className="mr-2 h-4 w-4" />
                      Rolle aendern
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleStatusToggle(user)}>
                      <UserX className="mr-2 h-4 w-4" />
                      {user.aktiv ? 'Deaktivieren' : 'Aktivieren'}
                    </DropdownMenuItem>
                    {!user.einladung_angenommen_am && (
                      <DropdownMenuItem onClick={() => handleResendInvite(user)}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Einladung erneut senden
                      </DropdownMenuItem>
                    )}
                    {currentUserId && user.user_id === currentUserId && (
                      <DropdownMenuItem onClick={() => setShowPasswortDialog(true)}>
                        <KeyRound className="mr-2 h-4 w-4" />
                        Passwort ändern
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {rolleDialogUser && (
        <RolleAendernDialog
          user={rolleDialogUser}
          open={!!rolleDialogUser}
          onOpenChange={(open) => {
            if (!open) setRolleDialogUser(null)
          }}
          onSuccess={() => {
            setRolleDialogUser(null)
            onRefresh()
          }}
        />
      )}

      <PasswortAendernDialog
        open={showPasswortDialog}
        onOpenChange={setShowPasswortDialog}
      />
    </>
  )
}
