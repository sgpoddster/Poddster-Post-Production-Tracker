'use client'

import { useState } from 'react'

export default function CopyProjectIdButton({ jobId }: { jobId: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(jobId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={copy}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-medium transition-all ${
        copied
          ? 'bg-green-500/15 border-green-500/30 text-green-400'
          : 'bg-transparent hover:bg-th/10 border-th/15 text-th/50 hover:text-th/80'
      }`}
    >
      {copied ? (
        <>✓ Copied!</>
      ) : (
        <>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          Copy project ID
        </>
      )}
    </button>
  )
}
