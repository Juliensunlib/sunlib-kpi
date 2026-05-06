'use client'
import { useState, useCallback } from 'react'
import type { KPIData, ChangeEntry, Segment, TypeInstall } from '@/lib/kpi-engine'
import KPICard from './KPICard'
import MonthlyChart from './MonthlyChart'
import Changelog from './Changelog'

interface Props {
  initialData: KPIData | null
  changelog: Array<{ date: string; entries: ChangeEntry[] }>
  error: string | null
}

export default function DashboardClient({ initialData, changelog, error }: Props) {
  const [data, setData] = useState<KPIData | null>(initialData)
  const [loading, setLoading] = useState(false)
  const [segment, setSegment] = useState<Segment>('Tous')
  const [typeInstall, setTypeInstall] = useState<TypeInstall>('Tous')
  const [annee, setAnnee] = useState<string>('')
  const [activeTab, setActiveTab] = useState<'signes' | 'poses' | 'capex' | 'kwc' | 'duree'>('signes')
  const [showChangelog, setShowChangelog] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const loadData = useCallback(async (seg: Segment, ti: TypeInstall, yr: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ segment: seg, typeInstall: ti })
      if (yr) params.set('annee', yr)
      const res = await fetch(`/api/kpis?${params}`)
      const json = await res.json()
      setData(json)
    } catch {}
    setLoading(false)
  }, [])

  function applyFilter(s: Segment, ti: TypeInstall, yr: string) {
    setSegment(s); setTypeInstall(ti); setAnnee(yr)
    loadData(s, ti, yr)
  }

  async function triggerSnapshot() {
    setRefreshing(true)
    await fetch('/api/snapshot', { method: 'POST' })
    setRefreshing(false)
    alert('Snapshot créé et comparé avec le précédent.')
  }

  async function logout() {
    await fetch('/api/auth', { method: 'DELETE' })
    window.location.href = '/login'
  }

  if (error) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-lg">
        <h2 className="font-semibold text-red-800 mb-2">Erreur de chargement</h2>
        <p className="text-sm text-red-700">{error}</p>
        <p className="text-xs text-red-500 mt-2">Vérifier AIRTABLE_API_KEY et les IDs dans .env</p>
      </div>
    </div>
  )

  const g = data?.global
  const monthly = data?.monthly || []
  const currentYear = new Date().getFullYear()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-screen-2xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5">
                <path d="M12 2a1 1 0 011 1v2a1 1 0 01-2 0V3a1 1 0 011-1zm0 16a1 1 0 011 1v2a1 1 0 01-2 0v-2a1 1 0 011-1zm10-8a1 1 0 010 2h-2a1 1 0 010-2h2zM4 12a1 1 0 010 2H2a1 1 0 010-2h2zm9.07-7.07a1 1 0 010 1.41l-1.42 1.42a1 1 0 11-1.41-1.42l1.42-1.41a1 1 0 011.41 0zM7.76 16.24a1 1 0 010 1.41L6.34 19.07a1 1 0 11-1.41-1.41l1.41-1.42a1 1 0 011.42 0zm9.9 1.41a1 1 0 01-1.42 0l-1.41-1.41a1 1 0 011.41-1.42l1.42 1.42a1 1 0 010 1.41zM7.76 7.76a1 1 0 01-1.42 0L4.93 6.34a1 1 0 011.41-1.41L7.76 6.34a1 1 0 010 1.42zM12 7a5 5 0 110 10A5 5 0 0112 7z"/>
              </svg>
            </div>
            <span className="font-semibold text-gray-900">SunLib</span>
            <span className="text-gray-400 text-sm">KPI Direction</span>
          </div>

          {/* Filtres */}
          <div className="flex items-center gap-2">
            <select value={segment} onChange={e => applyFilter(e.target.value as Segment, typeInstall, annee)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
              <option>Tous</option>
              <option>Pro</option>
              <option>Solo</option>
              <option>Duo</option>
            </select>
            <select value={typeInstall} onChange={e => applyFilter(segment, e.target.value as TypeInstall, annee)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
              <option value="Tous">Toutes installations</option>
              <option value="PV seul">PV seul</option>
              <option value="PV + Batterie">PV + Batterie</option>
              <option value="PV + Batterie Virtuelle">PV + Batterie Virtuelle</option>
            </select>
            <select value={annee} onChange={e => applyFilter(segment, typeInstall, e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
              <option value="">Toutes années</option>
              <option value="2024">2024</option>
              <option value="2025">2025</option>
              <option value="2026">2026</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            {data && (
              <p className="text-xs text-gray-400">
                Màj {new Date(data.last_updated).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
            <button onClick={() => setShowChangelog(!showChangelog)}
              className="relative text-sm px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              📋 Journal
              {changelog.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center">
                  {Math.min(changelog.length, 9)}
                </span>
              )}
            </button>
            <button onClick={triggerSnapshot} disabled={refreshing}
              className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
              {refreshing ? '⏳' : '📸'} Snapshot
            </button>
            <button onClick={logout}
              className="text-sm px-3 py-1.5 text-gray-500 hover:text-gray-700">
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-6 py-6">
        {loading && (
          <div className="text-center py-4 text-sm text-gray-500">Chargement…</div>
        )}

        {/* KPI Cards globaux */}
        {g && (
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 mb-6">
            <KPICard label="Contrats signés" value={g.total_signes} unit="" icon="📝" />
            <KPICard label="Poses réalisées" value={g.total_poses} unit="" icon="🔧"
              sub={`${Math.round(g.total_poses / Math.max(g.total_signes, 1) * 100)}% de taux de pose`} />
            <KPICard label="kWc signés" value={g.total_kwc} unit=" kWc" icon="⚡" decimals={1} />
            <KPICard label="CAPEX engagé" value={g.total_capex_ht} unit=" €" icon="💶" format="currency" />
            <KPICard label="Abo. moyen" value={g.moy_abonnement} unit=" €/mois" icon="💰" />
            <KPICard label="Durée moy. contrat" value={g.moy_duree_contrat} unit=" ans" icon="📅" decimals={1} />
            <KPICard label="Durée moy. F2" value={g.moy_duree_f2} unit=" j" icon="⏱️"
              sub="Signature → Pose validée" />
            <KPICard label="Mandats SEPA" value={g.mandats_signes} unit={`/${g.mandats_total}`} icon="🏦"
              sub={`${Math.round(g.mandats_signes / Math.max(g.mandats_total, 1) * 100)}% signés`} />
          </div>
        )}

        {/* Onglets graphiques */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="border-b border-gray-100 flex">
            {([
              { id: 'signes', label: '📝 Contrats signés' },
              { id: 'poses', label: '🔧 Poses (F2)' },
              { id: 'capex', label: '💶 CAPEX HT' },
              { id: 'kwc', label: '⚡ kWc' },
              { id: 'duree', label: '⏱️ Durée F2' },
            ] as const).map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-amber-500 text-amber-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}>
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-6">
            {monthly.length > 0 && (
              <MonthlyChart
                data={monthly}
                metric={activeTab}
                segment={segment}
              />
            )}
            {monthly.length === 0 && !loading && (
              <p className="text-center text-gray-400 py-12">Aucune donnée pour ces filtres</p>
            )}
          </div>
        </div>

        {/* Grille stat répartition */}
        {g && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <StatGrid title="Répartition segment" data={g.par_segment} total={g.total_signes} />
            <StatGrid title="Type d'installation" data={g.par_type_install} total={g.total_signes} />
            <StatGrid title="Statut dossiers" data={g.par_statut} total={Object.values(g.par_statut).reduce((a,b)=>a+b,0)} />
          </div>
        )}
      </main>

      {/* Panel changelog */}
      {showChangelog && (
        <div className="fixed inset-y-0 right-0 w-96 bg-white border-l border-gray-200 shadow-xl z-20 flex flex-col">
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="font-semibold text-gray-900">Journal des modifications</h2>
            <button onClick={() => setShowChangelog(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <Changelog entries={changelog} />
          </div>
        </div>
      )}
    </div>
  )
}

function StatGrid({ title, data, total }: { title: string; data: Record<string, number>; total: number }) {
  const sorted = Object.entries(data).sort((a, b) => b[1] - a[1])
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{title}</h3>
      <div className="space-y-2">
        {sorted.map(([k, v]) => (
          <div key={k}>
            <div className="flex justify-between text-sm mb-0.5">
              <span className="text-gray-700 truncate pr-2">{k}</span>
              <span className="font-medium text-gray-900 flex-shrink-0">
                {v} <span className="text-gray-400 font-normal">({Math.round(v/Math.max(total,1)*100)}%)</span>
              </span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full">
              <div className="h-1.5 bg-amber-400 rounded-full" style={{ width: `${Math.round(v/Math.max(total,1)*100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
