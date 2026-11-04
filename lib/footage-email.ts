import { createServiceClient } from '@/lib/supabase/server'

type ServiceClient = ReturnType<typeof createServiceClient>

export interface ClientContact {
  name: string
  email: string | null
  email_2: string | null
  email_3: string | null
}

interface DeliveryLike {
  email?: string | null
  extra_emails?: string[] | null
  client_name?: string | null
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()
// "A.D Family (ADF)" → "a.d family"
const baseName = (s: string | null | undefined) => norm(s).replace(/\s*\([^)]*\)\s*$/, '')

function dedupe(list: (string | null | undefined)[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const e of list) {
    const v = e?.trim()
    if (v && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase())
      out.push(v)
    }
  }
  return out
}

// The admin Clients record for this booking: any of its 3 emails matches the
// booking email, or (fallback) its name matches the booking name.
export function matchClient(delivery: DeliveryLike, clients: ClientContact[]): ClientContact | null {
  const email = norm(delivery.email)
  // Studio addresses (e.g. singapore@poddster.com) are placeholders on several clients — never match on them
  if (email && !email.endsWith('@poddster.com')) {
    const byEmail = clients.find(c => [c.email, c.email_2, c.email_3].some(e => norm(e) === email))
    if (byEmail) return byEmail
  }
  const name = baseName(delivery.client_name)
  return name ? clients.find(c => baseName(c.name) === name) ?? null : null
}

// Everyone a footage email goes to: booking email + the client's emails from
// Admin → Clients + any per-booking extras. De-duplicated, case-insensitive.
export function deliveryRecipients(delivery: DeliveryLike, clients: ClientContact[] = []): string[] {
  const c = matchClient(delivery, clients)
  return dedupe([delivery.email, c?.email, c?.email_2, c?.email_3, ...(delivery.extra_emails ?? [])])
}

export async function loadClientContacts(supabase: ServiceClient): Promise<ClientContact[]> {
  const { data } = await supabase.from('clients').select('name, email, email_2, email_3')
  return (data ?? []) as ClientContact[]
}
