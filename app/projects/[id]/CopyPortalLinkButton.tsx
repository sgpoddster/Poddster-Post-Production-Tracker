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
      className="px-3 py-1.5 rounded-lg bg-th/[0.06] hover:bg-th/10 text-th/60 hover:text-th text-xs font-medium transition-colors"
    >
      {copied ? '✓ Copied' : 'Copy client link'}
    </button>
  )
}
