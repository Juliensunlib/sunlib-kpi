'use client'
import { useState, useEffect } from 'react'

const fmtEur = (v: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)

interface ComRow {
  nom: string; signes: number; annules: number; taux_annulation: number
  capex: number; kwc: number; poses: number; taux_pose: number
  abo_moyen: number; duree_f2_moy: number
}
interface InstRow {
  nom: string; signes: number; annules: number; taux_annulation: number
  capex: number; kwc: number; poses: number; taux_pose: number; duree_f2_moy: number
}
interface MastRow {
  nom: string; signes: number; capex: number; kwc: number; poses: number; taux_pose: number
}
interface CommercialData {
  par_commercial: ComRow[]
  par_installateur: InstRow[]
  par_masteur: MastRow[]
  par_segmentation: Record<string, number>
  apporteurs: { avec: number; sans: number }
  meta: {
    total_signes: number; total_annules: number; taux_annulation_global: number
    total_commerciaux: number; total_installateurs: number
  }
}

type SortDir = 'asc' | 'desc'

function useSort<T>(data: T[], defaultKey: keyof T) {
  const [key, setKey] = useState<keyof T>(defaultKey)
  const [dir, setDir] = useState<SortDir>('desc')

  const sorted = [...data].sort((a, b) => {
    const av = a[key], bv = b[key]
    if (typeof av === 'number' && typeof bv === 'number')
      return dir === 'desc' ? bv - av : av - bv
    return dir === 'desc'
      ? String(bv).localeCompare(String(av))
      : String(av).localeCompare(String(bv))
  })

  function toggle(k: keyof T) {
    if (k === key) setDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setKey(k); setDir('desc') }
  }

  return { sorted, key, dir, toggle }
}

function Th({ label, col, sortKey, dir, onSort }: {
  label: string; col: string
  sortKey: string; dir: SortDir; onSort: (k: string) => void
}) {
  const active = col === sortKey
  return (
    <th onClick={() => onSort(col)}
      className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-800 whitespace-nowrap">
      <span className="flex items-center gap-1">
        {label}
        <span className={`text-xs ${active ? 'text-amber-500' : 'text-gray-300'}`}>
          {active ? (dir === 'desc' ? '↓' : '↑') : '↕'}
        </span>
      </span>
    </th>
  )
}

function Pill({ value, max, color = 'amber' }: { value: number; max: number; color?: string }) {
  const pct = max ? Math.round(value / max * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-gray-800 w-6 text-right">{value}</span>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full min-w-[40px]">
        <div className={`h-1.5 rounded-full bg-${color}-400`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function CommercialClient() {
  const [data, setData]       = useState<CommercialData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [annee, setAnnee]     = useState('')
  const [view, setView]       = useState<'commerciaux' | 'installateurs' | 'masteurs'>('commerciaux')

  async function load(yr: string) {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams()
      if (yr) params.set('annee', yr)
      const res  = await fetch(`/api/commercial?${params}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setData(json)
    } catch (e) { setError(String(e)) }
    setLoading(false)
  }

  useEffect(() => { load('') }, [])

  const comSort  = useSort<ComRow>(data?.par_commercial || [], 'signes')
  const instSort = useSort<InstRow>(data?.par_installateur || [], 'signes')
  const mastSort = useSort<MastRow>(data?.par_masteur || [], 'signes')

  const maxComSignes  = Math.max(...(data?.par_commercial.map(c => c.signes) || [1]))
  const maxInstSignes = Math.max(...(data?.par_installateur.map(i => i.signes) || [1]))

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 mr-2">
            <div className="w-7 h-7 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white text-sm">👥</span>
            </div>
            <span className="font-semibold text-gray-900 text-sm">KPIs Commerciaux</span>
          </div>

          {/* Filtre année */}
          <select value={annee}
            onChange={e => { setAnnee(e.target.value); load(e.target.value) }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
            <option value="">Toutes années</option>
            <option value="2024">2024</option>
            <option value="2025">2025</option>
            <option value="2026">2026</option>
          </select>

          {/* Switch de vue */}
          <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
            {(['commerciaux', 'installateurs', 'masteurs'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1 text-sm rounded-md transition-colors capitalize ${
                  view === v ? 'bg-white shadow-sm text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {v === 'commerciaux' ? '👤 Commerciaux' : v === 'installateurs' ? '🏗️ Installateurs' : '🔑 Masteurs'}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* Retour */}
          <a href="/dashboard"
            className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
            ← Production
          </a>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-4 py-5">
        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-500">Chargement des données commerciales…</p>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5 mb-5">
            <p className="font-semibold text-red-800">{error}</p>
          </div>
        )}

        {!loading && !error && data && (
          <>
            {/* Cards globales */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
              <div className="kpi-card">
                <p className="kpi-label">Contrats signés</p>
                <p className="kpi-value">{data.meta.total_signes}</p>
              </div>
              <div className="kpi-card">
                <p className="kpi-label">Annulés</p>
                <p className="kpi-value text-red-500">{data.meta.total_annules}</p>
                <p className="kpi-sub">Taux {data.meta.taux_annulation_global}%</p>
              </div>
              <div className="kpi-card">
                <p className="kpi-label">Commerciaux actifs</p>
                <p className="kpi-value">{data.meta.total_commerciaux}</p>
              </div>
              <div className="kpi-card">
                <p className="kpi-label">Installateurs actifs</p>
                <p className="kpi-value">{data.meta.total_installateurs}</p>
              </div>
              <div className="kpi-card">
                <p className="kpi-label">Apporteurs d'affaire</p>
                <p className="kpi-value">{data.apporteurs.avec}</p>
                <p className="kpi-sub">
                  {data.apporteurs.avec + data.apporteurs.sans > 0
                    ? Math.round(data.apporteurs.avec / (data.apporteurs.avec + data.apporteurs.sans) * 100)
                    : 0}% du total
                </p>
              </div>
            </div>

            {/* Vue Commerciaux */}
            {view === 'commerciaux' && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h2 className="font-semibold text-gray-900">Performance par commercial</h2>
                  <p className="text-xs text-gray-400 mt-0.5">{data.par_commercial.length} commerciaux · Cliquez sur une colonne pour trier</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <Th label="Commercial"    col="nom"            sortKey={String(comSort.key)} dir={comSort.dir} onSort={k => comSort.toggle(k as keyof ComRow)} />
                        <Th label="Signés"        col="signes"         sortKey={String(comSort.key)} dir={comSort.dir} onSort={k => comSort.toggle(k as keyof ComRow)} />
                        <Th label="Annulés"       col="annules"        sortKey={String(comSort.key)} dir={comSort.dir} onSort={k => comSort.toggle(k as keyof ComRow)} />
                        <Th label="Taux annul."   col="taux_annulation" sortKey={String(comSort.key)} dir={comSort.dir} onSort={k => comSort.toggle(k as keyof ComRow)} />
                        <Th label="CAPEX HT"      col="capex"          sortKey={String(comSort.key)} dir={comSort.dir} onSort={k => comSort.toggle(k as keyof ComRow)} />
                        <Th label="kWc"           col="kwc"            sortKey={String(comSort.key)} dir={comSort.dir} onSort={k => comSort.toggle(k as keyof ComRow)} />
                        <Th label="Poses"         col="poses"          sortKey={String(comSort.key)} dir={comSort.dir} onSort={k => comSort.toggle(k as keyof ComRow)} />
                        <Th label="Taux pose"     col="taux_pose"      sortKey={String(comSort.key)} dir={comSort.dir} onSort={k => comSort.toggle(k as keyof ComRow)} />
                        <Th label="Abo. moyen"    col="abo_moyen"      sortKey={String(comSort.key)} dir={comSort.dir} onSort={k => comSort.toggle(k as keyof ComRow)} />
                        <Th label="Durée F2 moy." col="duree_f2_moy"   sortKey={String(comSort.key)} dir={comSort.dir} onSort={k => comSort.toggle(k as keyof ComRow)} />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {comSort.sorted.map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50 transition-colors">
                          <td className="px-3 py-2.5">
                            <span className="font-medium text-gray-900">{row.nom}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <Pill value={row.signes} max={maxComSignes} color="blue" />
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`font-medium ${row.annules > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                              {row.annules}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`text-sm font-medium ${
                              row.taux_annulation > 20 ? 'text-red-500' :
                              row.taux_annulation > 10 ? 'text-orange-500' : 'text-gray-500'
                            }`}>{row.taux_annulation}%</span>
                          </td>
                          <td className="px-3 py-2.5 text-gray-700 font-medium">{fmtEur(row.capex)}</td>
                          <td className="px-3 py-2.5 text-gray-700">{row.kwc.toFixed(1)} kWc</td>
                          <td className="px-3 py-2.5 text-gray-700">{row.poses}</td>
                          <td className="px-3 py-2.5">
                            <span className={`text-sm font-medium ${
                              row.taux_pose >= 70 ? 'text-emerald-600' :
                              row.taux_pose >= 40 ? 'text-amber-600' : 'text-gray-400'
                            }`}>{row.taux_pose}%</span>
                          </td>
                          <td className="px-3 py-2.5 text-gray-700">{fmtEur(row.abo_moyen)}</td>
                          <td className="px-3 py-2.5 text-gray-500">
                            {row.duree_f2_moy > 0 ? `${row.duree_f2_moy.toFixed(0)} j` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Vue Installateurs */}
            {view === 'installateurs' && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h2 className="font-semibold text-gray-900">Performance par installateur</h2>
                  <p className="text-xs text-gray-400 mt-0.5">{data.par_installateur.length} installateurs · Cliquez sur une colonne pour trier</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <Th label="Installateur"  col="nom"            sortKey={String(instSort.key)} dir={instSort.dir} onSort={k => instSort.toggle(k as keyof InstRow)} />
                        <Th label="Signés"        col="signes"         sortKey={String(instSort.key)} dir={instSort.dir} onSort={k => instSort.toggle(k as keyof InstRow)} />
                        <Th label="Annulés"       col="annules"        sortKey={String(instSort.key)} dir={instSort.dir} onSort={k => instSort.toggle(k as keyof InstRow)} />
                        <Th label="Taux annul."   col="taux_annulation" sortKey={String(instSort.key)} dir={instSort.dir} onSort={k => instSort.toggle(k as keyof InstRow)} />
                        <Th label="CAPEX HT"      col="capex"          sortKey={String(instSort.key)} dir={instSort.dir} onSort={k => instSort.toggle(k as keyof InstRow)} />
                        <Th label="kWc"           col="kwc"            sortKey={String(instSort.key)} dir={instSort.dir} onSort={k => instSort.toggle(k as keyof InstRow)} />
                        <Th label="Poses"         col="poses"          sortKey={String(instSort.key)} dir={instSort.dir} onSort={k => instSort.toggle(k as keyof InstRow)} />
                        <Th label="Taux pose"     col="taux_pose"      sortKey={String(instSort.key)} dir={instSort.dir} onSort={k => instSort.toggle(k as keyof InstRow)} />
                        <Th label="Durée F2 moy." col="duree_f2_moy"   sortKey={String(instSort.key)} dir={instSort.dir} onSort={k => instSort.toggle(k as keyof InstRow)} />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {instSort.sorted.map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50 transition-colors">
                          <td className="px-3 py-2.5">
                            <span className="font-medium text-gray-900">{row.nom}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <Pill value={row.signes} max={maxInstSignes} color="amber" />
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`font-medium ${row.annules > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                              {row.annules}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`text-sm font-medium ${
                              row.taux_annulation > 20 ? 'text-red-500' :
                              row.taux_annulation > 10 ? 'text-orange-500' : 'text-gray-500'
                            }`}>{row.taux_annulation}%</span>
                          </td>
                          <td className="px-3 py-2.5 text-gray-700 font-medium">{fmtEur(row.capex)}</td>
                          <td className="px-3 py-2.5 text-gray-700">{row.kwc.toFixed(1)} kWc</td>
                          <td className="px-3 py-2.5 text-gray-700">{row.poses}</td>
                          <td className="px-3 py-2.5">
                            <span className={`text-sm font-medium ${
                              row.taux_pose >= 70 ? 'text-emerald-600' :
                              row.taux_pose >= 40 ? 'text-amber-600' : 'text-gray-400'
                            }`}>{row.taux_pose}%</span>
                          </td>
                          <td className="px-3 py-2.5 text-gray-500">
                            {row.duree_f2_moy > 0 ? `${row.duree_f2_moy.toFixed(0)} j` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Vue Masteurs */}
            {view === 'masteurs' && (
              <div className="space-y-4">
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100">
                    <h2 className="font-semibold text-gray-900">Performance par masteur</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Responsable commercial de l'installateur</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <Th label="Masteur"   col="nom"      sortKey={String(mastSort.key)} dir={mastSort.dir} onSort={k => mastSort.toggle(k as keyof MastRow)} />
                          <Th label="Signés"    col="signes"   sortKey={String(mastSort.key)} dir={mastSort.dir} onSort={k => mastSort.toggle(k as keyof MastRow)} />
                          <Th label="CAPEX HT"  col="capex"    sortKey={String(mastSort.key)} dir={mastSort.dir} onSort={k => mastSort.toggle(k as keyof MastRow)} />
                          <Th label="kWc"       col="kwc"      sortKey={String(mastSort.key)} dir={mastSort.dir} onSort={k => mastSort.toggle(k as keyof MastRow)} />
                          <Th label="Poses"     col="poses"    sortKey={String(mastSort.key)} dir={mastSort.dir} onSort={k => mastSort.toggle(k as keyof MastRow)} />
                          <Th label="Taux pose" col="taux_pose" sortKey={String(mastSort.key)} dir={mastSort.dir} onSort={k => mastSort.toggle(k as keyof MastRow)} />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {mastSort.sorted.map((row, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-3 py-2.5 font-medium text-gray-900">{row.nom}</td>
                            <td className="px-3 py-2.5 text-gray-700">{row.signes}</td>
                            <td className="px-3 py-2.5 text-gray-700 font-medium">{fmtEur(row.capex)}</td>
                            <td className="px-3 py-2.5 text-gray-700">{row.kwc.toFixed(1)} kWc</td>
                            <td className="px-3 py-2.5 text-gray-700">{row.poses}</td>
                            <td className="px-3 py-2.5">
                              <span className={`text-sm font-medium ${
                                row.taux_pose >= 70 ? 'text-emerald-600' :
                                row.taux_pose >= 40 ? 'text-amber-600' : 'text-gray-400'
                              }`}>{row.taux_pose}%</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Répartitions */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                      Segmentation installateurs
                    </h3>
                    <div className="space-y-2">
                      {Object.entries(data.par_segmentation)
                        .sort((a, b) => b[1] - a[1])
                        .map(([k, v]) => {
                          const total = Object.values(data.par_segmentation).reduce((a, b) => a + b, 0)
                          return (
                            <div key={k}>
                              <div className="flex justify-between text-sm mb-0.5">
                                <span className="text-gray-700">{k || '—'}</span>
                                <span className="font-medium text-gray-900">
                                  {v} <span className="text-gray-400 text-xs">({Math.round(v / total * 100)}%)</span>
                                </span>
                              </div>
                              <div className="h-1.5 bg-gray-100 rounded-full">
                                <div className="h-1.5 bg-blue-400 rounded-full"
                                  style={{ width: `${Math.round(v / total * 100)}%` }} />
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                      Apporteurs d'affaire
                    </h3>
                    <div className="space-y-3">
                      {[
                        { label: 'Avec apporteur', value: data.apporteurs.avec, color: 'blue' },
                        { label: 'Sans apporteur', value: data.apporteurs.sans, color: 'gray' },
                      ].map(({ label, value, color }) => {
                        const total = data.apporteurs.avec + data.apporteurs.sans
                        return (
                          <div key={label}>
                            <div className="flex justify-between text-sm mb-0.5">
                              <span className="text-gray-700">{label}</span>
                              <span className="font-medium">
                                {value} <span className="text-gray-400 text-xs">
                                  ({total ? Math.round(value / total * 100) : 0}%)
                                </span>
                              </span>
                            </div>
                            <div className="h-1.5 bg-gray-100 rounded-full">
                              <div className={`h-1.5 bg-${color}-400 rounded-full`}
                                style={{ width: `${total ? Math.round(value / total * 100) : 0}%` }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
