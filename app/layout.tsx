import type { Metadata } from 'next'
import './globals.css'
import { Navbar } from '@/components/Navbar'
import { ThemeProvider } from '@/components/ThemeProvider'
import { TimeFormatProvider } from '@/components/TimeFormatProvider'

export const metadata: Metadata = {
  title: 'Poddster Post Production',
  description: 'Internal post-production project tracking',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* Runs synchronously before hydration to prevent flash of wrong theme */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){var t=localStorage.getItem('theme');if(t==='light')document.documentElement.classList.add('light');})();` }} />
      </head>
      <body className="min-h-screen bg-brand-black font-sans">
        <ThemeProvider>
          <TimeFormatProvider>
            <Navbar />
            {children}
          </TimeFormatProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
