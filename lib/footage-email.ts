// Everyone a footage email goes to: the booking email plus any extra recipients
// added on the Footage Delivery page. De-duplicated, case-insensitive.
export function deliveryRecipients(delivery: { email?: string | null; extra_emails?: string[] | null }): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const e of [delivery.email, ...(delivery.extra_emails ?? [])]) {
    const v = e?.trim()
    if (v && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase())
      out.push(v)
    }
  }
  return out
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
