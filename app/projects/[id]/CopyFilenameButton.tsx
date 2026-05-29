'use client'

import { useState } from 'react'
import { buildOutputFilename } from '@/lib/utils'

interface Props {
  internalId: string
  filmingDate: string | null
  filmingTime: string | null
  versionNumber: number
}

export default function CopyFilenameButton({ internalId, filmingDate, filmingTime, versionNumber }: Props) {
  const [copied, setCopied] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)

  const filename = buildOutputFilename(internalId, filmingDate, filmingTime, versionNumber)

  async function copy() {
    await navigator.clipboard.writeText(filename)
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
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            Copy filename
          </>
        )}
      </button>

      {/* Tooltip showing the filename */}
      {showTooltip && !copied && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20 pointer-events-none">
          <div className="bg-[#111] border border-white/15 rounded-lg px-3 py-2 text-xs text-white/80 font-mono whitespace-nowrap shadow-xl">
            {filename}
          </div>
          <div className="w-2 h-2 bg-[#111] border-r border-b border-white/15 rotate-45 mx-auto -mt-1" />
        </div>
      )}
    </div>
  )
}
