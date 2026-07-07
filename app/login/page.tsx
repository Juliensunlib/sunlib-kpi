'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [pw, setPw] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      })
      if (res.ok) {
        router.push('/dashboard')
        router.refresh()
      } else {
        setError('Mot de passe incorrect')
      }
    } catch {
      setError('Erreur de connexion')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas">
      <div className="bg-surface rounded-card shadow-xl border border-line p-10 w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-control bg-brand-gradient mb-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
              <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-ink">SunLib KPIs</h1>
          <p className="text-sm text-muted mt-1">Accès réservé à la direction</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-1">
              Mot de passe
            </label>
            <input
              type="password"
              value={pw}
              onChange={e => setPw(e.target.value)}
              className="w-full border border-line rounded-control px-4 py-2.5 text-sm focus:outline-none focus-visible:shadow-focus"
              placeholder="••••••••"
              autoFocus
              required
            />
          </div>
          {error && <p className="text-sm text-semred">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full justify-center py-2.5"
          >
            {loading ? 'Connexion…' : <>Accéder au dashboard <span className="btn-arrow">→</span></>}
          </button>
        </form>
      </div>
    </div>
  )
}
