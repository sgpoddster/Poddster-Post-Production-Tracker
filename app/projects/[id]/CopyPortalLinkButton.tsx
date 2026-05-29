'use client'

import { useState } from 'react'

export default function CopyPortalLinkButton({ portalToken }: { portalToken: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    const url = `${window.location.origin}/client/${portalToken}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={copy}
      className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/10 text-white/60 hover:text-white text-xs font-medium transition-colors"
    >
      {copied ? '✓ Copied' : 'Copy client link'}
    </button>
  )
}
