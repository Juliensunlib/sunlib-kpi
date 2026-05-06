import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SunLib KPIs',
  description: 'Dashboard KPI Direction — SunLib',
  robots: 'noindex, nofollow',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="bg-gray-50 text-gray-900 min-h-screen">
        {children}
      </body>
    </html>
  )
}
