'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2,
  CreditCard,
  Globe,
  Wallet,
  LayoutGrid,
  MoreVertical,
  Pencil,
  Trash2,
  Upload,
} from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { QuelleLoeschenDialog } from '@/components/zahlungsquellen/quelle-loeschen-dialog'
import type { ZahlungsquelleTyp } from '@/lib/supabase/types'
import type { ZahlungsquelleWithMeta } from '@/app/(app)/settings/zahlungsquellen/page'

const TYP_ICONS: Record<ZahlungsquelleTyp, typeof Building2> = {
  kontoauszug: Building2,
  kreditkarte: CreditCard,
  paypal: Globe,
  kassa: Wallet,
  sonstige: LayoutGrid,
}

const TYP_LABELS: Record<ZahlungsquelleTyp, string> = {
  kontoauszug: 'Bank',
  kreditkarte: 'Kreditkarte',
  paypal: 'PayPal',
  kassa: 'Kassa',
  sonstige: 'Sonstige',
}

interface QuelleKarteProps {
  quelle: ZahlungsquelleWithMeta
  onEdit: () => void
  onDeleted: () => void
  onToggled: () => void
  canActivate: boolean
}

function truncateIban(iban: string): string {
  if (iban.length <= 8) return iban
  return `${iban.slice(0, 4)} **** ${iban.slice(-4)}`
}

export function QuelleKarte({
  quelle,
  onEdit,
  onDeleted,
  onToggled,
  canActivate,
}: QuelleKarteProps) {
  const router = useRouter()
  const [toggling, setToggling] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const Icon = TYP_ICONS[quelle.typ] ?? LayoutGrid

  async function handleToggle(checked: boolean) {
    if (checked && !canActivate) return
    setToggling(true)
    try {
      const res = await fetch(`/api/zahlungsquellen/${quelle.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aktiv: checked }),
      })
      if (res.ok) onToggled()
    } finally {
      setToggling(false)
    }
  }

  return (
    <>
      <Card className={!quelle.aktiv ? 'opacity-60' : undefined}>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Icon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium leading-tight">{quelle.name}</p>
              <div className="mt-1 flex items-center gap-1.5">
                <Badge variant="secondary" className="text-xs font-normal">
                  {TYP_LABELS[quelle.typ]}
                </Badge>
                {quelle.kuerzel && (
                  <Badge variant="outline" className="text-xs font-mono">
                    {quelle.kuerzel}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Aktionen">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="mr-2 h-4 w-4" />
                Bearbeiten
              </DropdownMenuItem>
              {quelle.has_transactions ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuItem disabled>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Löschen
                      </DropdownMenuItem>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      <p>Quelle hat Transaktionen und kann nicht gelöscht werden</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Löschen
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>
        <CardContent className="space-y-3">
          {quelle.iban && (
            <p className="text-sm text-muted-foreground font-mono">
              {truncateIban(quelle.iban)}
            </p>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {quelle.aktiv ? 'Aktiv' : 'Inaktiv'}
            </span>
            <Switch
              checked={quelle.aktiv}
              onCheckedChange={handleToggle}
              disabled={toggling || (!quelle.aktiv && !canActivate)}
              aria-label={`${quelle.name} ${quelle.aktiv ? 'deaktivieren' : 'aktivieren'}`}
            />
          </div>
          {quelle.aktiv && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => router.push(`/transaktionen/import?quelle_id=${quelle.id}`)}
            >
              <Upload className="mr-2 h-3.5 w-3.5" />
              CSV importieren
            </Button>
          )}
        </CardContent>
      </Card>

      <QuelleLoeschenDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        quelle={quelle}
        onDeleted={onDeleted}
      />
    </>
  )
}
