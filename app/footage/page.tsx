import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getUserProfile } from '@/lib/auth'
import { FootageDelivery } from '@/lib/types'
import FootageDriveLinkInput from '@/components/FootageDriveLinkInput'
import FootageSendButton from '@/components/FootageSendButton'
import FootageConvertButton from '@/components/FootageConvertButton'
import { SearchBar } from '@/app/dashboard/SearchBar'

function formatDate(d: string | null): string {
  if (!d) return '—'
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const diff = new Date(dateStr + 'T00:00:00').getTime() - new Date().setHours(0,0,0,0)
  return Math.ceil(diff / 86_400_000)
}

function ExpiryBadge({ expiresAt }: { expiresAt: string | null }) {
  if (!expiresAt) return null
  const days = daysUntil(expiresAt)
  if (days === null) return null
  const urgent = days !== null && days <= 2
  const expired = days !== null && days < 0
  if (expired) {
    return <span className="text-[11px] px-2 py-0.5 rounded bg-red-500/15 text-red-400 font-medium">Expired</span>
  }
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${urgent ? 'bg-amber-400/15 text-amber-400' : 'bg-th/[0.06] text-th/40'}`}>
      {days === 0 ? 'Expires today' : `${days}d left`}
    </span>
  )
}

function DeliveryRow({ delivery }: { delivery: FootageDelivery }) {
  const time = delivery.filming_time?.split(' - ')[0] ?? null
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 sm:px-5 py-4 border-b border-th/[0.05] hover:bg-th/[0.02] transition-colors last:border-0">
      {/* Left: booking info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm text-th/90">
            {delivery.client_name ?? '(no name)'}
          </span>
          {delivery.client_code && (
            <code className="text-[11px] text-th/35 font-mono">{delivery.client_code}</code>
          )}
          {delivery.sent_at && <ExpiryBadge expiresAt={delivery.expires_at} />}
        </div>
        <div className="mt-0.5 text-xs text-th/40 flex items-center gap-2 flex-wrap">
          <span>{formatDate(delivery.filming_date)}</span>
          {time && <span>· {time}</span>}
          {delivery.setup && <span>· {delivery.setup}</span>}
          {delivery.job_id && <code className="font-mono text-th/25">{delivery.job_id}</code>}
        </div>
      </div>

      {/* Right: drive link + send buttons */}
      <div className="flex flex-col gap-2 sm:w-[420px] shrink-0">
        {/* Drive link row */}
        <div className="flex items-center gap-2">
          {delivery.drive_link ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <a
                href={delivery.drive_link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-w-0 truncate text-xs text-blue-400/80 hover:text-blue-400 underline underline-offset-2 decoration-dotted transition-colors"
                title={delivery.drive_link}
              >
                {delivery.drive_link.replace('https://drive.google.com/', 'drive.google.com/…').slice(0, 45)}…
              </a>
              <FootageDriveLinkInput deliveryId={delivery.id} initialLink={delivery.drive_link} />
            </div>
          ) : (
            <FootageDriveLinkInput deliveryId={delivery.id} initialLink={null} />
          )}
        </div>
        {/* Action buttons row */}
        <div className="flex items-center gap-2 flex-wrap">
          {!delivery.sent_at ? (
            <FootageSendButton deliveryId={delivery.id} hasDriveLink={!!delivery.drive_link} />
          ) : (
            <span className="shrink-0 text-[11px] text-green-400/70 whitespace-nowrap">
              ✓ Sent {formatDate(delivery.sent_at.split('T')[0])}
            </span>
          )}
          <FootageConvertButton
            deliveryId={delivery.id}
            hasDriveLink={!!delivery.drive_link}
            conversionStatus={delivery.conversion_status}
          />
        </div>
      </div>
    </div>
  )
}

function Section({
  title,
  count,
  children,
  accent,
}: {
  title: string
  count: number
  children: React.ReactNode
  accent?: string
}) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-sm font-semibold text-th/70 uppercase tracking-wider">{title}</h2>
        <span className={`text-xs px-2 py-0.5 rounded font-medium ${accent ?? 'bg-th/[0.08] text-th/40'}`}>
          {count}
        </span>
      </div>
      {count === 0 ? (
        <p className="text-sm text-th/30 px-1">None</p>
      ) : (
        <div className="bg-brand-surface border border-th/[0.06] rounded-lg overflow-hidden">
          {children}
        </div>
      )}
    </div>
  )
}

export default async function FootagePage({
  searchParams,
}: {
  searchParams?: { q?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getUserProfile()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const serviceClient = createServiceClient()
  const { data: rows } = await serviceClient
    .from('footage_deliveries')
    .select('*')
    .order('filming_date', { ascending: false })
    .order('filming_time', { ascending: false })

  const all = (rows ?? []) as FootageDelivery[]
  const today = new Date().toISOString().split('T')[0]

  const q = searchParams?.q?.toLowerCase().trim() ?? ''
  const filtered = q
    ? all.filter(d =>
        [d.client_name, d.client_code, d.job_id, d.order_id, d.setup, d.filming_date]
          .some(v => v?.toLowerCase().includes(q))
      )
    : all

  const toSend  = filtered.filter(d => !d.sent_at)
  const active  = filtered.filter(d => d.sent_at && (!d.expires_at || d.expires_at >= today))
  const expired = filtered.filter(d => d.sent_at && d.expires_at && d.expires_at < today)

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-th/90">Footage Delivery</h1>
        <p className="mt-1 text-sm text-th/40">Footage-only sessions — no post-production. Add Drive link and send to client.</p>
      </div>

      <div className="mb-6 max-w-sm">
        <SearchBar defaultValue={searchParams?.q} />
      </div>

      <Section title="To Send" count={toSend.length} accent="bg-amber-400/15 text-amber-400">
        {toSend.map(d => <DeliveryRow key={d.id} delivery={d} />)}
      </Section>

      <Section title="Active" count={active.length} accent="bg-green-500/15 text-green-400">
        {active.map(d => <DeliveryRow key={d.id} delivery={d} />)}
      </Section>

      {expired.length > 0 && (
        <Section title="Expired" count={expired.length}>
          {expired.map(d => <DeliveryRow key={d.id} delivery={d} />)}
        </Section>
      )}
    </div>
  )
}
