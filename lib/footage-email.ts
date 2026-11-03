import { createServiceClient } from '@/lib/supabase/server'

type ServiceClient = ReturnType<typeof createServiceClient>

// Some calendar bookings (e.g. repeat clients booked from the newer system) have no
// "User Email:" line. Fall back to the most recent email we have for the same client name.
export async function lookupClientEmail(supabase: ServiceClient, clientName: string | null): Promise<string | null> {
  if (!clientName?.trim()) return null
  const { data } = await supabase
    .from('footage_deliveries')
    .select('email')
    .ilike('client_name', clientName.trim())
    .not('email', 'is', null)
    .order('filming_date', { ascending: false })
    .limit(1)
  return (data?.[0]?.email as string | undefined) ?? null
}

// Returns the delivery's email, backfilling it from a previous booking if missing.
export async function resolveDeliveryEmail(
  supabase: ServiceClient,
  delivery: { id: string; email: string | null; client_name: string | null },
): Promise<string | null> {
  if (delivery.email) return delivery.email
  const email = await lookupClientEmail(supabase, delivery.client_name)
  if (email) {
    await supabase.from('footage_deliveries').update({ email }).eq('id', delivery.id)
  }
  return email
}
