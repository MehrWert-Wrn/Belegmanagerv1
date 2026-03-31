'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, MessageCircleQuestion, Minus } from 'lucide-react'
import { toast } from 'sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { WorkflowStatus } from '@/lib/supabase/types'

interface WorkflowStatusSectionProps {
  transaktionId: string
  initialStatus: WorkflowStatus
  onStatusChange?: (newStatus: WorkflowStatus) => void
}

const STATUS_CONFIG: Record<
  WorkflowStatus,
  { label: string; icon: React.ReactNode; description: string }
> = {
  normal: {
    label: 'Normal',
    icon: <Minus className="h-4 w-4 text-muted-foreground" />,
    description: 'Keine besondere Kennzeichnung',
  },
  rueckfrage: {
    label: 'Rueckfrage',
    icon: <MessageCircleQuestion className="h-4 w-4 text-amber-500" />,
    description: 'Offene Frage zu dieser Transaktion',
  },
  erledigt: {
    label: 'Erledigt',
    icon: <CheckCircle2 className="h-4 w-4 text-teal-500" />,
    description: 'Frage geklaert, keine Aktion noetig',
  },
}

export function WorkflowStatusSection({
  transaktionId,
  initialStatus,
  onStatusChange,
}: WorkflowStatusSectionProps) {
  const [status, setStatus] = useState<WorkflowStatus>(initialStatus)
  const [saving, setSaving] = useState(false)

  // Sync with parent when a different transaction is shown in the same mounted sheet
  useEffect(() => {
    setStatus(initialStatus)
  }, [initialStatus])

  async function handleChange(newStatus: WorkflowStatus) {
    const previousStatus = status
    // Optimistic update
    setStatus(newStatus)

    setSaving(true)
    try {
      const response = await fetch(
        `/api/transaktionen/${transaktionId}/workflow-status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workflow_status: newStatus }),
        }
      )

      if (!response.ok) {
        throw new Error('Status konnte nicht gespeichert werden')
      }

      onStatusChange?.(newStatus)
      toast.success('Workflow-Status aktualisiert')
    } catch {
      // Rollback on error
      setStatus(previousStatus)
      toast.error('Fehler beim Speichern des Status')
    } finally {
      setSaving(false)
    }
  }

  const currentConfig = STATUS_CONFIG[status]

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Workflow-Status</h3>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {currentConfig.icon}
          <span>{currentConfig.description}</span>
        </div>
      </div>
      <Select
        value={status}
        onValueChange={(value) => handleChange(value as WorkflowStatus)}
        disabled={saving}
      >
        <SelectTrigger className="w-full" aria-label="Workflow-Status aendern">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="normal">
            <span className="flex items-center gap-2">
              <Minus className="h-3.5 w-3.5 text-muted-foreground" />
              Normal
            </span>
          </SelectItem>
          <SelectItem value="rueckfrage">
            <span className="flex items-center gap-2">
              <MessageCircleQuestion className="h-3.5 w-3.5 text-amber-500" />
              Rueckfrage
            </span>
          </SelectItem>
          <SelectItem value="erledigt">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-teal-500" />
              Erledigt
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
