// Admin Panel types

export type OverrideType = 'permanent' | 'until_date' | null

export type TicketStatus = 'open' | 'in_progress' | 'closed'

export type SenderType = 'mandant' | 'admin'

export type AuditAction =
  | 'impersonation_start'
  | 'impersonation_stop'
  | 'override_set'
  | 'override_removed'

export interface AdminMandant {
  id: string
  firmenname: string
  owner_id: string
  owner_email: string
  erstellt_am: string
  last_sign_in_at: string | null
  subscription_status: string | null
  admin_override_type: OverrideType
  admin_override_until: string | null
  open_ticket_count: number
}

export interface AdminMandantDetail extends AdminMandant {
  uid_nummer: string | null
  rechtsform: string | null
  strasse: string | null
  plz: string | null
  ort: string | null
  land: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  current_period_end: string | null
}

export interface SupportTicket {
  id: string
  mandant_id: string
  subject: string
  status: TicketStatus
  assigned_to_admin_id: string | null
  assigned_admin_email?: string | null
  mandant_name?: string
  created_at: string
  updated_at: string
}

export interface SupportTicketMessage {
  id: string
  ticket_id: string
  sender_type: SenderType
  sender_id: string
  sender_email?: string
  message: string
  created_at: string
}

export interface AdminAuditLog {
  id: string
  admin_id: string
  mandant_id: string | null
  action_type: AuditAction
  metadata: Record<string, unknown> | null
  created_at: string
}
