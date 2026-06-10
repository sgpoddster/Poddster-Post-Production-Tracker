'use client'

import { useState } from 'react'
import NewProjectModal from '@/components/NewProjectModal'

interface Client {
  id: string
  name: string
  code: string | null
}

interface Props {
  clients: Client[]
  editors: { email: string; display_name: string | null }[]
  currentUserEmail: string
}

export default function NewProjectButton({ clients, editors, currentUserEmail }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-brand-red hover:bg-brand-red-dim text-th text-sm font-medium rounded transition-colors shrink-0"
      >
        + New Project
      </button>
      {open && (
        <NewProjectModal
          onClose={() => setOpen(false)}
          clients={clients}
          editors={editors}
          currentUserEmail={currentUserEmail}
        />
      )}
    </>
  )
}
