'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  CheckCircle2,
  Trash2,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  Shield,
  Mail,
  Clock,
  Building2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

interface CredentialRow {
  id: string
  mandant_id: string
  firmenname: string
  provider: string
  payload: Record<string, unknown> | null
  submitted_at: string
  acknowledged_at: string | null
}

const PROVIDER_LABELS: Record<string, string> = {
  microsoft365: 'Microsoft 365',
  gmail: 'Gmail',
  imap: 'IMAP',
}

const SENSITIVE_FIELDS = ['password', 'client_secret']

export function CredentialsTabelle() {
  const [credentials, setCredentials] = useState<CredentialRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchCredentials = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/credentials?page=0')
      if (!res.ok) throw new Error('Fehler beim Laden der Zugangsdaten')
      const json = await res.json()
      // API returns { data, page, hasMore }
      setCredentials(Array.isArray(json) ? json : (json.data ?? []))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCredentials()
  }, [fetchCredentials])

  const handleAcknowledge = async (id: string) => {
    setActionLoading(id)
    try {
      const res = await fetch(`/api/admin/credentials/${id}`, {
        method: 'PATCH',
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Fehler beim Bestaetigen')
      }
      toast.success('Als eingerichtet markiert.')
      await fetchCredentials()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setActionLoading(null)
    }
  }

  const handleDelete = async (id: string) => {
    setActionLoading(id)
    try {
      const res = await fetch(`/api/admin/credentials/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Fehler beim Loeschen')
      }
      toast.success('Zugangsdaten unwiderruflich geloescht.')
      await fetchCredentials()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50/50">
        <CardHeader>
          <CardTitle className="text-base text-red-800">Fehler</CardTitle>
          <CardDescription className="text-red-700">{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" onClick={fetchCredentials}>
            Erneut versuchen
          </Button>
        </CardContent>
      </Card>
    )
  }

  const pendingCount = credentials.filter((c) => !c.acknowledged_at).length

  if (credentials.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Shield className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">
            Keine Zugangsdaten vorhanden.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Mandanten koennen ihre E-Mail-Zugangsdaten ueber die Onboarding-Checkliste uebermitteln.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {pendingCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <span className="text-sm font-medium text-amber-800">
            {pendingCount} neue Zugangsdaten warten auf Einrichtung
          </span>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mandant</TableHead>
                <TableHead>Anbieter</TableHead>
                <TableHead>Uebermittelt am</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {credentials.map((cred) => (
                <TableRow key={cred.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{cred.firmenname}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      {PROVIDER_LABELS[cred.provider] || cred.provider}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      {new Date(cred.submitted_at).toLocaleDateString('de-AT', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </TableCell>
                  <TableCell>
                    {cred.acknowledged_at ? (
                      <Badge className="bg-teal-100 text-teal-800 hover:bg-teal-100">
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        Eingerichtet
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                        <Clock className="mr-1 h-3 w-3" />
                        Offen
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {/* View credentials dialog */}
                      <CredentialDetailDialog credential={cred} />

                      {/* Acknowledge button */}
                      {!cred.acknowledged_at && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAcknowledge(cred.id)}
                          disabled={actionLoading === cred.id}
                        >
                          {actionLoading === cred.id ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                          )}
                          Eingerichtet
                        </Button>
                      )}

                      {/* Delete button (only if acknowledged) */}
                      {cred.acknowledged_at && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={actionLoading === cred.id}
                            >
                              {actionLoading === cred.id ? (
                                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="mr-1 h-3.5 w-3.5" />
                              )}
                              Loeschen
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Zugangsdaten endgueltig loeschen?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Die Zugangsdaten von <strong>{cred.firmenname}</strong> ({PROVIDER_LABELS[cred.provider] || cred.provider}) werden unwiderruflich geloescht. Diese Aktion kann nicht rueckgaengig gemacht werden.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(cred.id)}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                Endgueltig loeschen
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

// --- Credential Detail Dialog ---

function CredentialDetailDialog({ credential }: { credential: CredentialRow }) {
  const [showSecrets, setShowSecrets] = useState(false)

  if (!credential.payload) {
    return (
      <Button variant="ghost" size="sm" disabled>
        <AlertCircle className="mr-1 h-3.5 w-3.5" />
        Entschluesselung fehlgeschlagen
      </Button>
    )
  }

  return (
    <Dialog onOpenChange={(open) => { if (!open) setShowSecrets(false) }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Eye className="mr-1 h-3.5 w-3.5" />
          Details
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-teal-600" />
            {credential.firmenname}
          </DialogTitle>
          <DialogDescription>
            {PROVIDER_LABELS[credential.provider] || credential.provider} Zugangsdaten
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {Object.entries(credential.payload).map(([key, value]) => {
            const isSensitive = SENSITIVE_FIELDS.includes(key)
            const displayValue = String(value)

            return (
              <div key={key} className="space-y-1">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {formatFieldLabel(key)}
                </label>
                <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
                  <code className="flex-1 break-all text-sm">
                    {isSensitive && !showSecrets
                      ? '\u2022'.repeat(Math.min(displayValue.length, 24))
                      : displayValue}
                  </code>
                </div>
              </div>
            )
          })}

          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full"
            onClick={() => setShowSecrets(!showSecrets)}
          >
            {showSecrets ? (
              <>
                <EyeOff className="mr-1.5 h-3.5 w-3.5" />
                Sensible Daten verbergen
              </>
            ) : (
              <>
                <Eye className="mr-1.5 h-3.5 w-3.5" />
                Sensible Daten anzeigen
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function formatFieldLabel(key: string): string {
  const labels: Record<string, string> = {
    host: 'Host',
    port: 'Port',
    ssl: 'SSL/TLS',
    email: 'E-Mail-Adresse',
    password: 'Passwort',
    tenant_id: 'Tenant ID',
    client_id: 'Client ID',
    client_secret: 'Client Secret',
  }
  return labels[key] || key
}
