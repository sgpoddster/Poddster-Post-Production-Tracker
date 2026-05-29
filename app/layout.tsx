import type { Metadata } from 'next'
import './globals.css'
import { Navbar } from '@/components/Navbar'

export const metadata: Metadata = {
  title: 'Poddster Post Production',
  description: 'Internal post-production project tracking',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-brand-black font-sans">
        <Navbar />
        {children}
      </body>
    </html>
  )
}
