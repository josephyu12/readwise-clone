import type { Metadata } from 'next'
import './globals.css'
import AuthButton from '@/components/AuthButton'
import NotionSyncProcessor from '@/components/NotionSyncProcessor'

export const metadata: Metadata = {
  title: 'Freedwise',
  description: 'Resurface your highlights in daily summaries',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <div className="fixed top-4 right-4 z-50">
          <AuthButton />
        </div>
        <NotionSyncProcessor />
        {children}
      </body>
    </html>
  )
}

