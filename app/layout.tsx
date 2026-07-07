import type { Metadata } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import Script from 'next/script'
import './globals.css'

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'SunLib KPIs',
  description: 'Dashboard KPI Direction — SunLib',
  robots: 'noindex, nofollow',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={jakarta.variable}>
      <body className="bg-canvas text-ink min-h-screen font-sans">
        {children}
        <Script id="iframe-resize" strategy="afterInteractive">{`
          (function() {
            function postHeight() {
              var h = document.documentElement.scrollHeight;
              window.parent.postMessage({ type: 'iframe-resize', height: h }, '*');
            }
            postHeight();
            new ResizeObserver(postHeight).observe(document.body);
            setInterval(postHeight, 500);
          })();
        `}</Script>
      </body>
    </html>
  )
}
