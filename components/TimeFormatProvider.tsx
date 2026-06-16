'use client'

import { createContext, useContext, useEffect, useState } from 'react'

const TimeFormatContext = createContext<{ hour12: boolean; toggle: () => void }>({
  hour12: true,
  toggle: () => {},
})

export function useTimeFormat() {
  return useContext(TimeFormatContext)
}

export function TimeFormatProvider({ children }: { children: React.ReactNode }) {
  const [hour12, setHour12] = useState(true)

  useEffect(() => {
    setHour12(localStorage.getItem('timeFormat') !== '24h')
  }, [])

  function toggle() {
    const next = !hour12
    setHour12(next)
    localStorage.setItem('timeFormat', next ? '12h' : '24h')
  }

  return (
    <TimeFormatContext.Provider value={{ hour12, toggle }}>
      {children}
    </TimeFormatContext.Provider>
  )
}
