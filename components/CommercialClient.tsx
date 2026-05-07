'use client'
import { useState, useEffect, useMemo } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────
interface MonthlyRow { month: string; label: string; signes: number; annules: number; capex: number; kwc: number; poses: number }
interface InstRow    { nom: string; signes: number; annules: number; taux_annulation: number; capex: number; kwc: number; poses: number; taux_pose: number; duree_f2_moy: number; monthly: MonthlyRow[] }
interface ComRow     { nom: string; signes: number; annules: number; taux_annulation: number; capex: number; kwc: number; poses: number; taux_pose: number; abo_moyen: number; duree_f2_moy: number; tendance_signes: number; tendance_capex: number; monthly: MonthlyRow[]; installateurs: InstRow[] }
interface Data {
  months: string[]; month_labels: string[]
  par_commercial: ComRow[]; par_installateur: InstRow[]
  par_segmentation: Record<string, number>
  apporteurs: { avec: number; sans: number }
  meta: { total_signes: number; total_annules: number; taux_annulation_global: number; total_commerciaux: number; total_installateurs: number; cur_mois: string; prev_mois: string }
}

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmtEur = (v: number) =>
  v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M€` :
  v >= 1_000     ? `${Math.round(v / 1_000)}k€` : `${v}€`

const fmtEurFull = (v: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)

// ─── Initiales ────────────────────────────────────────────────────────────────
function initials(nom: string): string {
  const parts = nom.trim().split(' ').filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return nom.slice(0, 2).toUpperCase()
}

// ─── Couleurs avatar ─────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  'bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-teal-500',
  'bg-orange-500', 'bg-pink-500', 'bg-lime-600', 'bg-sky-500',
]
function avatarColor(nom: string): string {
  let h = 0; for (const c of nom) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

// ─── Sparkline SVG ───────────────────────────────────────────────────────────
function Sparkline({ data, color = '#f59e0b', width = 80, height = 24 }: { data: number[]; color?: string; width?: number; height?: number }) {
  if (!data.length) return <span className="text-gray-300 text-xs">—</span>
  const max = Math.max(...data, 1)
  const pts = data.map((v, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * width
    const y = height - (v / max) * (height - 2) - 1
    return `${x},${y}`
  }).join(' ')
  const last = data[data.length - 1]
  const prev = data[data.length - 2] ?? last
  const tColor = last >= prev ? '#10b981' : '#ef4444'
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={pts} opacity="0.4" />
      <polyline fill="none" stroke={tColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        points={data.slice(-3).map((v, i) => {
          const x = ((data.length - 3 + i) / Math.max(data.length - 1, 1)) * width
          const y = height - (v / max) * (height - 2) - 1
          return `${x},${y}`
        }).join(' ')} />
      {data.length > 0 && (() => {
        const lx = width; const ly = height - (last / max) * (height - 2) - 1
        return <circle cx={lx} cy={ly} r="2.5" fill={tColor} />
      })()}
    </svg>
  )
}

// ─── Heatmap cell ────────────────────────────────────────────────────────────
function HeatCell({ value, max, onClick }: { value: number; max: number; onClick?: () => void }) {
  const pct = max ? value / max : 0
  const bg = pct === 0 ? 'bg-gray-100' :
    pct < 0.2  ? 'bg-amber-100' :
    pct < 0.4  ? 'bg-amber-200' :
    pct < 0.6  ? 'bg-amber-300' :
    pct < 0.8  ? 'bg-amber-400' : 'bg-amber-500'
  const text = pct > 0.6 ? 'text-white' : 'text-gray-700'
  return (
    <div onClick={onClick}
      title={`${value} contrats`}
      className={`${bg} ${text} text-xs font-medium flex items-center justify-center rounded cursor-pointer hover:opacity-80 transition-opacity`}
      style={{ minWidth: 32, height: 28 }}>
      {value > 0 ? value : ''}
    </div>
  )
}

// ─── Tendance badge ───────────────────────────────────────────────────────────
function Trend({ v, unit = '' }: { v: number; unit?: string }) {
  if (v === 0) return <span className="text-gray-400 text-xs">—</span>
  const pos = v > 0
  return (
    <span className={`text-xs font-semibold flex items-center gap-0.5 ${pos ? 'text-emerald-600' : 'text-red-500'}`}>
      {pos ? '↑' : '↓'} {Math.abs(v)}{unit}
    </span>
  )
}

// ─── Barre % ──────────────────────────────────────────────────────────────────
function PctBar({ v, max, color = 'bg-blue-400' }: { v: number; max: number; color?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-gray-800 w-6 text-right">{v}</span>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full" style={{ minWidth: 40 }}>
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${max ? Math.round(v / max * 100) : 0}%` }} />
      </div>
    </div>
  )
}

// ─── Médaille ─────────────────────────────────────────────────────────────────
function Medal({ rank }: { rank: number }) {
  if (rank === 1) return <span title="🥇">🥇</span>
  if (rank === 2) return <span title="🥈">🥈</span>
  if (rank === 3) return <span title="🥉">🥉</span>
  return <span className="text-xs text-gray-400 font-bold w-5 text-center">#{rank}</span>
}

// ─── Graphique barres simple ──────────────────────────────────────────────────
function BarChart({ data, months }: { data: MonthlyRow[]; months: string[] }) {
  const maxVal = Math.max(...data.map(d => d.signes + d.annules), 1)
  return (
    <div className="flex items-end gap-1 h-32">
      {months.map(m => {
        const d = data.find(r => r.month === m) || { signes: 0, annules: 0, label: m.slice(-2) }
        const hS = Math.round((d.signes / maxVal) * 120)
        const hA = Math.round((d.annules / maxVal) * 120)
        return (
          <div key={m} className="flex-1 flex flex-col items-center gap-0.5 group">
            <div className="relative w-full flex flex-col justify-end" style={{ height: 120 }}>
              {d.annules > 0 && (
                <div className="w-full bg-red-300 rounded-t-sm" style={{ height: hA }}
                  title={`${d.annules} annulés`} />
              )}
              {d.signes > 0 && (
                <div className="w-full bg-amber-400 rounded-t-sm" style={{ height: hS }}
                  title={`${d.signes} signés`} />
              )}
            </div>
            <span className="text-xs text-gray-400 truncate w-full text-center leading-tight">
              {d.label || m.slice(-2)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Panneau drill-down commercial ────────────────────────────────────────────
function CommercialPanel({ com, months, onClose }: { com: ComRow; months: string[]; onClose: () => void }) {
  const [sortInst, setSortInst] = useState<keyof InstRow>('signes')
  const [sortDir, setSortDir]   = useState<'asc' | 'desc'>('desc')
  const [selInst, setSelInst]   = useState<InstRow | null>(null)

  const sorted = [...com.installateurs].sort((a, b) => {
    const av = a[sortInst] as number, bv = b[sortInst] as number
    return sortDir === 'desc' ? bv - av : av - bv
  })

  function toggleSort(k: keyof InstRow) {
    if (k === sortInst) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortInst(k); setSortDir('desc') }
  }

  const maxInst = Math.max(...sorted.map(i => i.signes), 1)

  return (
    <div className="fixed inset-0 z-30 flex">
      <div className="flex-1 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-3xl bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header du panel */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-5 text-white">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg ${avatarColor(com.nom)}`}>
                {initials(com.nom)}
              </div>
              <div>
                <h2 className="text-xl font-bold">{com.nom}</h2>
                <p className="text-blue-200 text-sm">{com.installateurs.length} installateur{com.installateurs.length > 1 ? 's' : ''}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none">✕</button>
          </div>
          {/* KPIs rapides */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Signés',     value: com.signes,               fmt: String },
              { label: 'CAPEX',      value: com.capex,                fmt: fmtEur },
              { label: 'kWc',        value: Math.round(com.kwc),      fmt: (v: number) => `${v} kWc` },
              { label: 'Taux pose',  value: com.taux_pose,            fmt: (v: number) => `${v}%` },
            ].map(({ label, value, fmt }) => (
              <div key={label} className="bg-white/10 rounded-lg p-2 text-center">
                <p className="text-white/60 text-xs">{label}</p>
                <p className="text-white font-bold text-lg">{fmt(value)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Graphique mensuel */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Activité mensuelle (12 derniers mois)</h3>
            <BarChart data={com.monthly} months={months} />
            <div className="flex gap-4 mt-1 text-xs text-gray-400">
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-400 rounded-sm inline-block" /> Signés</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-300 rounded-sm inline-block" /> Annulés</span>
            </div>
          </div>

          {/* Heatmap mensuelle */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Heatmap mensuelle</h3>
            <div className="overflow-x-auto">
              <div className="flex gap-1 min-w-max">
                {months.map(m => {
                  const d = com.monthly.find(r => r.month === m)
                  const max = Math.max(...com.monthly.map(r => r.signes), 1)
                  return (
                    <div key={m} className="flex flex-col items-center gap-1">
                      <HeatCell value={d?.signes || 0} max={max} />
                      <span className="text-xs text-gray-400 whitespace-nowrap" style={{ fontSize: 9 }}>
                        {d?.label || m.slice(-2)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Tableau installateurs */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              Ses installateurs ({com.installateurs.length})
            </h3>
            {selInst ? (
              <div className="border border-blue-200 rounded-xl overflow-hidden">
                <div className="bg-blue-50 p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setSelInst(null)} className="text-blue-600 hover:text-blue-800 text-sm">← Retour</button>
                    <span className="font-semibold text-gray-800">{selInst.nom}</span>
                  </div>
                  <div className="flex gap-4 text-sm">
                    <span><span className="font-bold text-amber-600">{selInst.signes}</span> signés</span>
                    <span><span className="font-bold text-emerald-600">{selInst.poses}</span> poses</span>
                    <span className="text-gray-500">{fmtEur(selInst.capex)}</span>
                  </div>
                </div>
                <div className="p-3">
                  <BarChart data={selInst.monthly} months={months} />
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {[
                        { label: 'Installateur', col: 'nom' as keyof InstRow },
                        { label: 'Signés',       col: 'signes' as keyof InstRow },
                        { label: 'Annulés',      col: 'annules' as keyof InstRow },
                        { label: 'CAPEX',        col: 'capex' as keyof InstRow },
                        { label: 'kWc',          col: 'kwc' as keyof InstRow },
                        { label: 'Poses',        col: 'poses' as keyof InstRow },
                        { label: 'Taux pose',    col: 'taux_pose' as keyof InstRow },
                      ].map(({ label, col }) => (
                        <th key={col} onClick={() => toggleSort(col)}
                          className="px-2 py-1.5 text-left text-xs font-semibold text-gray-500 cursor-pointer hover:text-gray-800 whitespace-nowrap select-none">
                          {label} {sortInst === col ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {sorted.map((inst, i) => (
                      <tr key={i} onClick={() => setSelInst(inst)}
                        className="hover:bg-blue-50 cursor-pointer transition-colors">
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1.5">
                            <PctBar v={inst.signes} max={maxInst} color="bg-amber-400" />
                          </div>
                          <p className="text-xs text-gray-600 mt-0.5 truncate max-w-[160px]">{inst.nom}</p>
                        </td>
                        <td className="px-2 py-2 font-medium text-gray-800">{inst.signes}</td>
                        <td className="px-2 py-2">
                          <span className={inst.annules > 0 ? 'text-red-500 font-medium' : 'text-gray-300'}>{inst.annules}</span>
                        </td>
                        <td className="px-2 py-2 text-gray-700">{fmtEur(inst.capex)}</td>
                        <td className="px-2 py-2 text-gray-600">{inst.kwc.toFixed(1)}</td>
                        <td className="px-2 py-2 text-gray-700">{inst.poses}</td>
                        <td className="px-2 py-2">
                          <span className={`text-sm font-semibold ${inst.taux_pose >= 70 ? 'text-emerald-600' : inst.taux_pose >= 40 ? 'text-amber-600' : 'text-gray-400'}`}>
                            {inst.taux_pose}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Dashboard principal ──────────────────────────────────────────────────────
export default function CommercialClient() {
  const [data, setData]       = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [annee, setAnnee]     = useState('')
  const [mois, setMois]       = useState('')
  const [view, setView]       = useState<'leaderboard' | 'installateurs' | 'heatmap'>('leaderboard')
  const [selCom, setSelCom]   = useState<ComRow | null>(null)
  const [sortInstCol, setSortInstCol] = useState<keyof InstRow>('signes')
  const [sortInstDir, setSortInstDir] = useState<'asc' | 'desc'>('desc')
  const [searchInst, setSearchInst]   = useState('')

  async function load(yr: string, mo: string) {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams()
      if (mo)      params.set('mois', mo)
      else if (yr) params.set('annee', yr)
      const res  = await fetch(`/api/commercial?${params}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setData(json)
    } catch (e) { setError(String(e)) }
    setLoading(false)
  }

  useEffect(() => { load('', '') }, [])

  const maxSignes = useMemo(() => Math.max(...(data?.par_commercial.map(c => c.signes) || [1]), 1), [data])

  const allMonthsForFilter = useMemo(() => {
    if (!data) return []
    return data.months.map(m => ({ value: m, label: data.month_labels[data.months.indexOf(m)] }))
  }, [data])

  const filteredInst = useMemo(() => {
    if (!data) return []
    let list = [...data.par_installateur]
    if (searchInst) list = list.filter(i => i.nom.toLowerCase().includes(searchInst.toLowerCase()))
    return list.sort((a, b) => {
      const av = a[sortInstCol] as number, bv = b[sortInstCol] as number
      if (typeof av === 'number' && typeof bv === 'number')
        return sortInstDir === 'desc' ? bv - av : av - bv
      return 0
    })
  }, [data, searchInst, sortInstCol, sortInstDir])

  const maxInstGlobal = useMemo(() => Math.max(...filteredInst.map(i => i.signes), 1), [filteredInst])
  const heatMax = useMemo(() => {
    if (!data) return 1
    return Math.max(...data.par_commercial.flatMap(c => c.monthly.map(m => m.signes)), 1)
  }, [data])

  function toggleInstSort(col: keyof InstRow) {
    if (col === sortInstCol) setSortInstDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortInstCol(col); setSortInstDir('desc') }
  }

  const views = [
    { id: 'leaderboard',   label: '🏆 Leaderboard' },
    { id: 'heatmap',       label: '🗓️ Heatmap' },
    { id: 'installateurs', label: '🏗️ Installateurs' },
  ] as const

  const top3 = data?.par_commercial.filter(c => c.nom !== 'Non assigné').slice(0, 3) || []

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 mr-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-sm">👥</span>
            </div>
            <span className="font-semibold text-gray-900 text-sm">CRM Commercial</span>
          </div>

          {/* Filtres */}
          <select value={annee} onChange={e => { setAnnee(e.target.value); setMois(''); load(e.target.value, '') }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
            <option value="">Toutes années</option>
            <option value="2024">2024</option>
            <option value="2025">2025</option>
            <option value="2026">2026</option>
          </select>

          <select value={mois} onChange={e => { setMois(e.target.value); setAnnee(''); load('', e.target.value) }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
            <option value="">Tous les mois</option>
            {allMonthsForFilter.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>

          {/* Switch vue */}
          <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
            {views.map(v => (
              <button key={v.id} onClick={() => setView(v.id)}
                className={`px-3 py-1 text-sm rounded-md transition-all ${view === v.id ? 'bg-white shadow-sm text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
                {v.label}
              </button>
            ))}
          </div>

          <div className="flex-1" />
          <a href="/dashboard" className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
            ← Production
          </a>
        </div>
      </header>

      {/* Drill-down panel */}
      {selCom && data && (
        <CommercialPanel com={selCom} months={data.months} onClose={() => setSelCom(null)} />
      )}

      <main className="max-w-screen-2xl mx-auto px-4 py-5 space-y-4">
        {loading && (
          <div className="flex items-center justify-center py-32">
            <div className="text-center">
              <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-500">Chargement des données CRM…</p>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5">
            <p className="font-semibold text-red-700">{error}</p>
          </div>
        )}

        {!loading && !error && data && (
          <>
            {/* Cards globales */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: 'Contrats signés',      value: String(data.meta.total_signes),       sub: undefined,                                          accent: false },
                { label: 'Annulés',              value: String(data.meta.total_annules),       sub: `Taux ${data.meta.taux_annulation_global}%`,         accent: true  },
                { label: 'Commerciaux actifs',   value: String(data.meta.total_commerciaux),  sub: undefined,                                          accent: false },
                { label: 'Installateurs actifs', value: String(data.meta.total_installateurs),sub: undefined,                                          accent: false },
                {
                  label: "Apporteurs d'affaire",
                  value: String(data.apporteurs.avec),
                  sub: `${(data.apporteurs.avec + data.apporteurs.sans) > 0 ? Math.round(data.apporteurs.avec / (data.apporteurs.avec + data.apporteurs.sans) * 100) : 0}% du total`,
                  accent: false
                },
              ].map(({ label, value, sub, accent }) => (
                <div key={label} className="kpi-card">
                  <p className="kpi-label">{label}</p>
                  <p className={`kpi-value ${accent ? 'text-red-500' : ''}`}>{value}</p>
                  {sub && <p className="kpi-sub">{sub}</p>}
                </div>
              ))}
            </div>

            {/* ── VUE LEADERBOARD ── */}
            {view === 'leaderboard' && (
              <div className="space-y-4">
                {/* Podium top 3 */}
                {top3.length >= 2 && (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-5">🏆 Top performers</h2>
                    <div className="flex items-end justify-center gap-4">
                      {/* 2e */}
                      {top3[1] && (
                        <div className="flex flex-col items-center gap-2 cursor-pointer" onClick={() => setSelCom(top3[1])}>
                          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-xl shadow-lg ${avatarColor(top3[1].nom)}`}>
                            {initials(top3[1].nom)}
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-gray-500 truncate max-w-[80px]">{top3[1].nom.split(' ')[0]}</p>
                            <p className="font-bold text-xl text-gray-800">{top3[1].signes}</p>
                            <p className="text-xs text-gray-400">{fmtEur(top3[1].capex)}</p>
                          </div>
                          <div className="w-20 bg-gray-200 rounded-t-lg flex items-center justify-center text-2xl" style={{ height: 60 }}>🥈</div>
                        </div>
                      )}
                      {/* 1er */}
                      {top3[0] && (
                        <div className="flex flex-col items-center gap-2 cursor-pointer" onClick={() => setSelCom(top3[0])}>
                          <div className="relative">
                            <div className={`w-18 h-18 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-xl ${avatarColor(top3[0].nom)}`}
                              style={{ width: 72, height: 72 }}>
                              {initials(top3[0].nom)}
                            </div>
                            <span className="absolute -top-2 -right-2 text-xl">👑</span>
                          </div>
                          <div className="text-center">
                            <p className="text-sm text-gray-600 font-medium truncate max-w-[100px]">{top3[0].nom.split(' ')[0]}</p>
                            <p className="font-bold text-3xl text-gray-900">{top3[0].signes}</p>
                            <p className="text-sm text-gray-500">{fmtEur(top3[0].capex)}</p>
                          </div>
                          <div className="w-24 bg-amber-400 rounded-t-lg flex items-center justify-center text-2xl" style={{ height: 80 }}>🥇</div>
                        </div>
                      )}
                      {/* 3e */}
                      {top3[2] && (
                        <div className="flex flex-col items-center gap-2 cursor-pointer" onClick={() => setSelCom(top3[2])}>
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-lg shadow-md ${avatarColor(top3[2].nom)}`}>
                            {initials(top3[2].nom)}
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-gray-500 truncate max-w-[70px]">{top3[2].nom.split(' ')[0]}</p>
                            <p className="font-bold text-lg text-gray-800">{top3[2].signes}</p>
                            <p className="text-xs text-gray-400">{fmtEur(top3[2].capex)}</p>
                          </div>
                          <div className="w-16 bg-orange-300 rounded-t-lg flex items-center justify-center text-2xl" style={{ height: 45 }}>🥉</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Tableau leaderboard */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div>
                      <h2 className="font-semibold text-gray-900">Classement commerciaux</h2>
                      <p className="text-xs text-gray-400 mt-0.5">Cliquez sur une ligne pour voir le détail</p>
                    </div>
                    <span className="text-xs text-gray-400">{data.par_commercial.length} commerciaux</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 w-10">#</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Commercial</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Volume</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400">Tendance</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400">CAPEX</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400">Annulés</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400">Taux pose</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400">Sparkline 12m</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400">Installs.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {data.par_commercial.map((com, i) => (
                          <tr key={com.nom}
                            className="hover:bg-blue-50 cursor-pointer transition-colors group"
                            onClick={() => setSelCom(com)}>
                            <td className="px-4 py-3">
                              <Medal rank={i + 1} />
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${avatarColor(com.nom)}`}>
                                  {initials(com.nom)}
                                </div>
                                <div>
                                  <p className="font-medium text-gray-900 text-sm">{com.nom}</p>
                                  <p className="text-xs text-gray-400">{com.abo_moyen > 0 ? `Abo. moy. ${fmtEurFull(com.abo_moyen)}` : '—'}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <PctBar v={com.signes} max={maxSignes} color={i < 3 ? 'bg-amber-400' : 'bg-blue-400'} />
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Trend v={com.tendance_signes} />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <p className="font-semibold text-gray-800 text-sm">{fmtEur(com.capex)}</p>
                              <Trend v={Math.round(com.tendance_capex / 1000)} unit="k€" />
                            </td>
                            <td className="px-4 py-3 text-center">
                              {com.annules > 0 ? (
                                <span className="inline-flex flex-col items-center">
                                  <span className="text-red-500 font-medium text-sm">{com.annules}</span>
                                  <span className="text-xs text-red-400">{com.taux_annulation}%</span>
                                </span>
                              ) : <span className="text-gray-300 text-sm">—</span>}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`text-sm font-semibold ${com.taux_pose >= 70 ? 'text-emerald-600' : com.taux_pose >= 40 ? 'text-amber-600' : 'text-gray-400'}`}>
                                {com.taux_pose}%
                              </span>
                            </td>
                            <td className="px-4 py-3 flex justify-center">
                              <Sparkline
                                data={data.months.map(m => com.monthly.find(r => r.month === m)?.signes || 0)}
                                color={i < 3 ? '#f59e0b' : '#60a5fa'}
                              />
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="text-sm text-gray-600 font-medium">{com.installateurs.length}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── VUE HEATMAP ── */}
            {view === 'heatmap' && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h2 className="font-semibold text-gray-900">Heatmap d'activité — Contrats signés par commercial et par mois</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Plus la cellule est foncée, plus le commercial est actif ce mois-là. Cliquez pour voir le détail.</p>
                </div>
                <div className="p-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="text-left text-xs font-semibold text-gray-400 pr-4 pb-2 min-w-[140px]">Commercial</th>
                        {data.months.map((m, i) => (
                          <th key={m} className="text-center text-xs text-gray-400 font-medium pb-2 px-0.5 whitespace-nowrap">
                            {data.month_labels[i]}
                          </th>
                        ))}
                        <th className="text-right text-xs font-semibold text-gray-400 pl-4 pb-2">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {data.par_commercial.map(com => (
                        <tr key={com.nom} className="hover:bg-gray-50 group">
                          <td className="pr-4 py-1.5">
                            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setSelCom(com)}>
                              <div className={`w-6 h-6 rounded-md flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${avatarColor(com.nom)}`}>
                                {initials(com.nom)}
                              </div>
                              <span className="text-sm font-medium text-gray-700 truncate max-w-[100px]">{com.nom}</span>
                            </div>
                          </td>
                          {data.months.map(m => {
                            const d = com.monthly.find(r => r.month === m)
                            return (
                              <td key={m} className="px-0.5 py-1.5">
                                <HeatCell value={d?.signes || 0} max={heatMax} onClick={() => setSelCom(com)} />
                              </td>
                            )
                          })}
                          <td className="pl-4 py-1.5 text-right">
                            <span className="font-bold text-gray-800">{com.signes}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {/* Ligne totaux */}
                    <tfoot>
                      <tr className="border-t-2 border-gray-200">
                        <td className="pr-4 pt-2 pb-1 text-xs font-semibold text-gray-500">TOTAL</td>
                        {data.months.map(m => {
                          const total = data.par_commercial.reduce((s, c) => s + (c.monthly.find(r => r.month === m)?.signes || 0), 0)
                          return (
                            <td key={m} className="px-0.5 pt-2 pb-1 text-center">
                              <span className="text-xs font-bold text-gray-600">{total || ''}</span>
                            </td>
                          )
                        })}
                        <td className="pl-4 pt-2 pb-1 text-right">
                          <span className="font-bold text-blue-600">{data.meta.total_signes}</span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {/* Légende */}
                <div className="px-5 pb-4 flex items-center gap-2 text-xs text-gray-400">
                  <span>Faible</span>
                  {['bg-gray-100', 'bg-amber-100', 'bg-amber-200', 'bg-amber-300', 'bg-amber-400', 'bg-amber-500'].map((c, i) => (
                    <div key={i} className={`w-5 h-4 rounded ${c}`} />
                  ))}
                  <span>Élevé</span>
                </div>
              </div>
            )}

            {/* ── VUE INSTALLATEURS ── */}
            {view === 'installateurs' && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-4">
                  <div className="flex-1">
                    <h2 className="font-semibold text-gray-900">Tous les installateurs</h2>
                    <p className="text-xs text-gray-400 mt-0.5">{filteredInst.length} installateurs · Cliquez sur une colonne pour trier</p>
                  </div>
                  <input
                    type="text"
                    placeholder="Rechercher un installateur…"
                    value={searchInst}
                    onChange={e => setSearchInst(e.target.value)}
                    className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-64 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        {[
                          { label: '#',           col: null },
                          { label: 'Installateur', col: 'nom' as keyof InstRow },
                          { label: 'Signés',       col: 'signes' as keyof InstRow },
                          { label: 'Annulés',      col: 'annules' as keyof InstRow },
                          { label: 'Taux annul.',  col: 'taux_annulation' as keyof InstRow },
                          { label: 'CAPEX HT',     col: 'capex' as keyof InstRow },
                          { label: 'kWc',          col: 'kwc' as keyof InstRow },
                          { label: 'Poses',        col: 'poses' as keyof InstRow },
                          { label: 'Taux pose',    col: 'taux_pose' as keyof InstRow },
                          { label: 'Durée F2',     col: 'duree_f2_moy' as keyof InstRow },
                          { label: 'Tendance 12m', col: null },
                        ].map(({ label, col }) => (
                          <th key={label}
                            onClick={() => col && toggleInstSort(col)}
                            className={`px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap ${col ? 'cursor-pointer hover:text-gray-800 select-none' : ''}`}>
                            {label} {col && sortInstCol === col ? (sortInstDir === 'desc' ? '↓' : '↑') : ''}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredInst.map((inst, i) => (
                        <tr key={inst.nom} className="hover:bg-amber-50 transition-colors">
                          <td className="px-3 py-2.5 text-gray-400 text-xs">{i + 1}</td>
                          <td className="px-3 py-2.5">
                            <p className="font-medium text-gray-800 truncate max-w-[200px]">{inst.nom}</p>
                          </td>
                          <td className="px-3 py-2.5">
                            <PctBar v={inst.signes} max={maxInstGlobal} color="bg-amber-400" />
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`font-medium ${inst.annules > 0 ? 'text-red-500' : 'text-gray-300'}`}>{inst.annules}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`text-sm font-medium ${inst.taux_annulation > 20 ? 'text-red-500' : inst.taux_annulation > 10 ? 'text-orange-500' : 'text-gray-400'}`}>
                              {inst.taux_annulation}%
                            </span>
                          </td>
                          <td className="px-3 py-2.5 font-medium text-gray-700">{fmtEur(inst.capex)}</td>
                          <td className="px-3 py-2.5 text-gray-600">{inst.kwc.toFixed(1)}</td>
                          <td className="px-3 py-2.5 text-gray-700">{inst.poses}</td>
                          <td className="px-3 py-2.5">
                            <span className={`font-semibold ${inst.taux_pose >= 70 ? 'text-emerald-600' : inst.taux_pose >= 40 ? 'text-amber-600' : 'text-gray-400'}`}>
                              {inst.taux_pose}%
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-gray-500">
                            {inst.duree_f2_moy > 0 ? `${Math.round(inst.duree_f2_moy)} j` : '—'}
                          </td>
                          <td className="px-3 py-2.5">
                            <Sparkline
                              data={data.months.map(m => inst.monthly.find(r => r.month === m)?.signes || 0)}
                              color="#f59e0b"
                              width={70}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
