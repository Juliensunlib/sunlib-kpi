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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="bg-white rounded-2xl shadow-xl p-10 w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-amber-500 mb-4">
            <svg viewBox="0 0 24 24" fill="white" className="w-8 h-8">
              <path d="M12 2a1 1 0 011 1v2a1 1 0 01-2 0V3a1 1 0 011-1zm0 16a1 1 0 011 1v2a1 1 0 01-2 0v-2a1 1 0 011-1zm10-8a1 1 0 010 2h-2a1 1 0 010-2h2zM4 12a1 1 0 010 2H2a1 1 0 010-2h2zm15.07-7.07a1 1 0 010 1.41l-1.42 1.42a1 1 0 11-1.41-1.42l1.42-1.41a1 1 0 011.41 0zM7.76 16.24a1 1 0 010 1.41L6.34 19.07a1 1 0 11-1.41-1.41l1.41-1.42a1 1 0 011.42 0zm9.9 1.41a1 1 0 01-1.42 0l-1.41-1.41a1 1 0 011.41-1.42l1.42 1.42a1 1 0 010 1.41zM7.76 7.76a1 1 0 01-1.42 0L4.93 6.34a1 1 0 011.41-1.41L7.76 6.34a1 1 0 010 1.42zM12 7a5 5 0 110 10A5 5 0 0112 7z"/>
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900">SunLib KPIs</h1>
          <p className="text-sm text-gray-500 mt-1">Accès réservé à la direction</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mot de passe
            </label>
            <input
              type="password"
              value={pw}
              onChange={e => setPw(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="••••••••"
              autoFocus
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-600 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-60"
          >
            {loading ? 'Connexion…' : 'Accéder au dashboard'}
          </button>
        </form>
      </div>
    </div>
  )
}
