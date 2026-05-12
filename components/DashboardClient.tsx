'use client'
import { useState, useEffect, useCallback } from 'react'
import MonthlyChart from './MonthlyChart'
import Changelog from './Changelog'

type Segment     = 'Tous' | 'Pro' | 'Particulier'
type TypeInstall = 'Tous' | 'PV seul' | 'PV + Batterie' | 'PV + Batterie Virtuelle'
type TabId       = 'signes' | 'poses' | 'capex_signes' | 'capex_poses' | 'kwc' | 'duree_f2'

interface ChangeEntry {
  metric: string; old_val: number | null; new_val: number
  delta: number; delta_pct: number | null; context?: string
}

interface KPIGlobal {
  total_signes: number; total_kwc_signes: number
  total_capex_signes: number; total_poses: number
  total_kwc_poses: number; total_capex_poses: number
  moy_abonnement: number; moy_duree_contrat: number; moy_duree_f2: number
  mandats_signes: number; mandats_total: number
  par_segment: Record<string, number>
  par_type_install: Record<string, number>
  par_statut: Record<string, number>
}

interface KPIData {
  global: KPIGlobal
  monthly: unknown[]
  total_records: number
  last_updated: string
}

const fmtEur = (v: number) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR',
    maximumFractionDigits: 0, minimumFractionDigits: 0,
  }).format(v)

function KPICard({ label, value, icon, sub, unit = '', decimals = 0, currency = false }: {
  label: string; value: number; icon?: string; sub?: string
  unit?: string; decimals?: number; currency?: boolean
}) {
  const display = currency ? fmtEur(value) : `${value.toFixed(decimals)}${unit}`
  return (
    <div className="kpi-card">
      <div className="flex items-start justify-between mb-1">
        <p className="kpi-label">{label}</p>
        {icon && <span className="text-base">{icon}</span>}
      </div>
      <p className="kpi-value">{display}</p>
      {sub && <p className="kpi-sub">{sub}</p>}
    </div>
  )
}

function StatBar({ title, data, total }: {
  title: string; data: Record<string, number>; total: number
}) {
  const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 8)
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{title}</h3>
      <div className="space-y-2">
        {sorted.map(([k, v]) => (
          <div key={k}>
            <div className="flex justify-between text-sm mb-0.5">
              <span className="text-gray-700 truncate pr-2">{k || '—'}</span>
              <span className="font-medium text-gray-900 flex-shrink-0">
                {v} <span className="text-gray-400 font-normal text-xs">
                  ({Math.round(v / Math.max(total, 1) * 100)}%)
                </span>
              </span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full">
              <div className="h-1.5 bg-amber-400 rounded-full"
                style={{ width: `${Math.round(v / Math.max(total, 1) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function DashboardClient() {
  const [data, setData]               = useState<KPIData | null>(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [segment, setSegment]         = useState<Segment>('Tous')
  const [typeInstall, setTypeInstall] = useState<TypeInstall>('Tous')
  const [annee, setAnnee]             = useState('')
  const [tab, setTab]                 = useState<TabId>('signes')
  const [showLog, setShowLog]         = useState(false)
  const [log, setLog]                 = useState<Array<{ date: string; entries: ChangeEntry[] }>>([])
  const [refreshing, setRefreshing]   = useState(false)

  const [lastRead, setLastRead] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('kpi_last_read') || ''
    }
    return ''
  })

  const unreadCount = log.filter(e => e.date > lastRead).length

  function markAsRead() {
    const now = new Date().toISOString()
    localStorage.setItem('kpi_last_read', now)
    setLastRead(now)
  }

  const load = useCallback(async (seg: Segment, ti: TypeInstall, yr: string) => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({ segment: seg, typeInstall: ti })
      if (yr) params.set('annee', yr)
      const res  = await fetch(`/api/kpis?${params}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setData(json)
    } catch (e) { setError(String(e)) }
    setLoading(false)
  }, [])

  useEffect(() => { load('Tous', 'Tous', '') }, [load])

  useEffect(() => {
    fetch('/api/snapshot')
      .then(r => r.json())
      .then(j => setLog(j.changelog ?? []))
      .catch(() => {})
  }, [])

  function applyFilter(s: Segment, ti: TypeInstall, yr: string) {
    setSegment(s); setTypeInstall(ti); setAnnee(yr)
    load(s, ti, yr)
  }

  async function snapshot() {
    setRefreshing(true)
    try {
      await fetch('/api/snapshot', { method: 'POST' })
      const res  = await fetch('/api/snapshot')
      const json = await res.json()
      setLog(json.changelog ?? [])
      alert('Snapshot créé ✓')
    } catch { alert('Erreur snapshot') }
    setRefreshing(false)
  }

  async function logout() {
    await fetch('/api/auth', { method: 'DELETE' })
    window.location.href = '/login'
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'signes',       label: '📝 Contrats signés' },
    { id: 'poses',        label: '🔧 Poses (F2)' },
    { id: 'capex_signes', label: '💶 CAPEX signé' },
    { id: 'capex_poses',  label: '💰 CAPEX posé' },
    { id: 'kwc',          label: '⚡ kWc' },
    { id: 'duree_f2',     label: '⏱️ Durée F2' },
  ]

  const g       = data?.global
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const monthly = (data?.monthly || []) as any[]

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 mr-2">
            <div className="w-7 h-7 bg-amber-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 24 24" fill="white" className="w-4 h-4">
                <path d="M12 2a1 1 0 011 1v2a1 1 0 01-2 0V3a1 1 0 011-1zm0 16a1 1 0 011 1v2a1 1 0 01-2 0v-2a1 1 0 011-1zm10-8a1 1 0 010 2h-2a1 1 0 010-2h2zM4 12a1 1 0 010 2H2a1 1 0 010-2h2zM12 7a5 5 0 110 10A5 5 0 0112 7z"/>
              </svg>
            </div>
            <span className="font-semibold text-gray-900 text-sm">SunLib KPIs</span>
          </div>

          <div className="flex items-center gap-2 flex-1 flex-wrap">
            <select value={segment}
              onChange={e => applyFilter(e.target.value as Segment, typeInstall, annee)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
              <option value="Tous">Tous segments</option>
              <option value="Pro">Pro</option>
              <option value="Particulier">Particulier</option>
            </select>
            <select value={typeInstall}
              onChange={e => applyFilter(segment, e.target.value as TypeInstall, annee)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
              <option value="Tous">Toutes installations</option>
              <option value="PV seul">PV seul</option>
              <option value="PV + Batterie">PV + Batterie</option>
              <option value="PV + Batterie Virtuelle">PV + Batterie Virtuelle</option>
            </select>
            <select value={annee}
              onChange={e => applyFilter(segment, typeInstall, e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
              <option value="">Toutes années</option>
              <option value="2024">2024</option>
              <option value="2025">2025</option>
              <option value="2026">2026</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            {data && (
              <span className="text-xs text-gray-400 hidden sm:block">
                {data.total_records} records · {new Date(data.last_updated).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button onClick={() => setShowLog(!showLog)}
              className="relative text-sm px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50">
              📋 Journal
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">
                  {Math.min(unreadCount, 9)}
                </span>
              )}
            </button>
            <button onClick={snapshot} disabled={refreshing}
              className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
              {refreshing ? '⏳' : '📸'} Snapshot
            </button>
            <a href="/commercial"
              className="text-sm px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 text-blue-700 font-medium">
              👥 Commercial
            </a>
            <button onClick={logout}
              className="text-sm px-3 py-1.5 text-gray-500 hover:text-gray-700">
              Déco
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-4 py-5">
        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-500">Chargement des données Airtable…</p>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5 mb-5">
            <p className="font-semibold text-red-800 mb-1">Erreur de chargement</p>
            <pre className="text-sm text-red-700 whitespace-pre-wrap break-all">{error}</pre>
          </div>
        )}

        {!loading && !error && g && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <KPICard label="Contrats signés"  value={g.total_signes}     icon="📝" />
              <KPICard label="Poses réalisées"   value={g.total_poses}      icon="🔧"
                sub={`${Math.round(g.total_poses / Math.max(g.total_signes, 1) * 100)}% taux pose`} />
              <KPICard label="kWc signés"        value={g.total_kwc_signes} unit=" kWc" icon="⚡" decimals={2} />
              <KPICard label="Mandats SEPA"      value={g.mandats_signes}   unit={`/${g.mandats_total}`} icon="🏦"
                sub={`${Math.round(g.mandats_signes / Math.max(g.mandats_total, 1) * 100)}% signés`} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              <KPICard label="CAPEX signé"   value={g.total_capex_signes} icon="💶" currency />
              <KPICard label="CAPEX posé"    value={g.total_capex_poses}  icon="💰" currency />
              <KPICard label="Abo. moyen"    value={g.moy_abonnement}     icon="📊" currency />
              <KPICard label="Durée moy. F2" value={g.moy_duree_f2}       unit=" j" icon="⏱️"
                sub="Sig. → Pose validée" decimals={1} />
            </div>

            <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-4">
              <div className="border-b border-gray-100 flex overflow-x-auto">
                {tabs.map(t => (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                      tab === t.id
                        ? 'border-amber-500 text-amber-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}>
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="p-5">
                {monthly.length > 0
                  ? <MonthlyChart data={monthly} metric={tab} showSegments={segment === 'Tous'} />
                  : <p className="text-center text-gray-400 py-16">Aucune donnée pour ces filtres</p>
                }
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatBar title="Répartition segment"  data={g.par_segment}      total={g.total_signes} />
              <StatBar title="Type d'installation"  data={g.par_type_install} total={g.total_signes} />
              <StatBar title="Statut dossiers"
                data={g.par_statut}
                total={Object.values(g.par_statut).reduce((a, b) => a + b, 0)} />
            </div>
          </>
        )}
      </main>

      {showLog && (
        <div className="fixed inset-y-0 right-0 w-96 max-w-full bg-white border-l border-gray-200 shadow-xl z-20 flex flex-col">
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-gray-900">Journal</h2>
              {unreadCount > 0 && (
                <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full font-bold">
                  {unreadCount} non lu{unreadCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button onClick={markAsRead}
                  className="text-xs text-amber-600 hover:text-amber-800 font-medium px-2 py-1 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors">
                  ✓ Marquer comme lu
                </button>
              )}
              <button onClick={() => setShowLog(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <Changelog entries={log} lastRead={lastRead} />
          </div>
        </div>
      )}
    </div>
  )
}
