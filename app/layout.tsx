import type { Metadata } from 'next'
import Script from 'next/script'
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
