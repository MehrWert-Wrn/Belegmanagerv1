import { Badge } from '@/components/ui/badge'

export type ReferralStatus =
  | 'clicked'
  | 'registered'
  | 'pending'
  | 'rewarded'
  | 'expired'
  | 'blocked'

const STATUS_LABELS: Record<ReferralStatus, string> = {
  clicked: 'Angeklickt',
  registered: 'Registriert',
  pending: 'Ausstehend',
  rewarded: 'Belohnt',
  expired: 'Abgelaufen',
  blocked: 'Blockiert',
}

const STATUS_CLASSES: Record<ReferralStatus, string> = {
  clicked: 'bg-gray-100 text-gray-700 hover:bg-gray-100 border-gray-200',
  registered: 'bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200',
  pending: 'bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200',
  rewarded: 'bg-teal-100 text-teal-700 hover:bg-teal-100 border-teal-200',
  expired: 'bg-slate-100 text-slate-600 hover:bg-slate-100 border-slate-200',
  blocked: 'bg-rose-100 text-rose-700 hover:bg-rose-100 border-rose-200',
}

interface StatusBadgeProps {
  status: ReferralStatus
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={`${STATUS_CLASSES[status]} text-xs font-medium`}
    >
      {STATUS_LABELS[status]}
    </Badge>
  )
}
