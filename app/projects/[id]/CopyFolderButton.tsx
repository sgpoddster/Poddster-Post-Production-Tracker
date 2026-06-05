'use client'

import { useState } from 'react'
import { buildFolderName } from '@/lib/utils'

interface Props {
  jobId: string
  filmingDate: string | null
  filmingTime: string | null
}

export default function CopyFolderButton({ jobId, filmingDate, filmingTime }: Props) {
  const [copied, setCopied] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)

  const folder = buildFolderName(jobId, filmingDate, filmingTime)

  async function copy() {
    await navigator.clipboard.writeText(folder)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative inline-flex items-center">
      <button
        onClick={copy}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-medium transition-all ${
          copied
            ? 'bg-green-500/15 border-green-500/30 text-green-400'
            : 'bg-transparent hover:bg-white/10 border-white/15 text-white/50 hover:text-white/80'
        }`}
      >
        {copied ? (
          <>✓ Copied!</>
        ) : (
          <>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            Copy folder name
          </>
        )}
      </button>

      {showTooltip && !copied && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20 pointer-events-none">
          <div className="bg-[#111] border border-white/15 rounded-lg px-3 py-2 text-xs text-white/80 font-mono whitespace-nowrap shadow-xl">
            {folder}
          </div>
          <div className="w-2 h-2 bg-[#111] border-r border-b border-white/15 rotate-45 mx-auto -mt-1" />
        </div>
      )}
    </div>
  )
}
