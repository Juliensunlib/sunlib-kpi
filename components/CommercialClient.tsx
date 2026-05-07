'use client'
import { useState, useEffect, useMemo } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────
interface MonthlyRow {
  month: string; label: string; signes: number; annules: number
  capex: number; kwc: number; poses: number
}
interface InstRow {
  nom: string; signes: number; annules: number; taux_annulation: number
  capex: number; kwc: number; poses: number; taux_pose: number
  duree_f2_moy: number; monthly: MonthlyRow[]
}
interface ComRow {
  nom: string; signes: number; annules: number; taux_annulation: number
  capex: number; kwc: number; poses: number; taux_pose: number
  abo_moyen: number; duree_f2_moy: number; tendance_signes: number
  tendance_capex: number; monthly: MonthlyRow[]; installateurs: InstRow[]
}
interface ApiData {
  months: string[]; month_labels: string[]
  par_commercial: ComRow[]; par_installateur: InstRow[]
  par_segmentation: Record<string, number>
  apporteurs: { avec: number; sans: number }
  meta: {
    total_signes: number; total_annules: number; taux_annulation_global: number
    total_commerciaux: number; total_installateurs: number
  }
}

type SortDir = 'asc' | 'desc'

// ─── Utilitaires ──────────────────────────────────────────────────────────────
const fmtK = (v: number) =>
  v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M€`
  : v >= 1_000   ? `${Math.round(v / 1_000)}k€`
  : `${v}€`

const fmtFull = (v: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)

function initials(s: string) {
  const p = s.trim().split(' ').filter(Boolean)
  return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : s.slice(0, 2).toUpperCase()
}

const COLORS = [
  'bg-blue-500','bg-violet-500','bg-emerald-500','bg-amber-500',
  'bg-rose-500','bg-cyan-500','bg-indigo-500','bg-teal-500',
  'bg-orange-500','bg-pink-500','bg-lime-600','bg-sky-500',
]
function avatarBg(s: string) {
  let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
  return COLORS[Math.abs(h) % COLORS.length]
}

// ─── Hook tri ────────────────────────────────────────────────────────────────
function useSort(items: Record<string, unknown>[], def: string) {
  const [col, setCol] = useState(def)
  const [dir, setDir] = useState<SortDir>('desc')
  const sorted = [...items].sort((a, b) => {
    const av = a[col], bv = b[col]
    if (typeof av === 'number' && typeof bv === 'number')
      return dir === 'desc' ? bv - av : av - bv
    return dir === 'desc'
      ? String(bv).localeCompare(String(av))
      : String(av).localeCompare(String(bv))
  })
  const toggle = (k: string) => {
    if (k === col) setDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setCol(k); setDir('desc') }
  }
  return { sorted, col, dir, toggle }
}

// ─── Composants UI ───────────────────────────────────────────────────────────
function Th({ label, k, col, dir, onSort }: {
  label: string; k: string; col: string; dir: SortDir; onSort: (k: string) => void
}) {
  const active = k === col
  return (
    <th onClick={() => onSort(k)}
      className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-800 whitespace-nowrap">
      <span className="flex items-center gap-1">
        {label}
        <span className={`text-xs ${active ? 'text-amber-500' : 'text-gray-300'}`}>
          {active ? (dir === 'desc' ? '↓' : '↑') : '↕'}
        </span>
      </span>
    </th>
  )
}

function Avatar({ nom, size = 8 }: { nom: string; size?: number }) {
  return (
    <div className={`w-${size} h-${size} rounded-lg flex items-center justify-center text-white font-bold flex-shrink-0 ${avatarBg(nom)}`}
      style={{ width: size * 4, height: size * 4, fontSize: size * 1.5 }}>
      {initials(nom)}
    </div>
  )
}

function TauxPose({ v }: { v: number }) {
  const cls = v >= 70 ? 'text-emerald-600' : v >= 40 ? 'text-amber-600' : 'text-gray-400'
  return <span className={`text-sm font-semibold ${cls}`}>{v}%</span>
}

function TauxAnnul({ v }: { v: number }) {
  const cls = v > 20 ? 'text-red-500' : v > 10 ? 'text-orange-500' : 'text-gray-400'
  return <span className={`text-sm font-medium ${cls}`}>{v}%</span>
}

function Trend({ v }: { v: number }) {
  if (v === 0) return <span className="text-gray-300 text-xs">—</span>
  const pos = v > 0
  return (
    <span className={`text-xs font-semibold flex items-center gap-0.5 ${pos ? 'text-emerald-600' : 'text-red-500'}`}>
      {pos ? '↑' : '↓'} {Math.abs(v)}
    </span>
  )
}

function PctBar({ v, max, color = 'bg-blue-400' }: { v: number; max: number; color?: string }) {
  const pct = max ? Math.round(v / max * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-gray-800 w-6 text-right">{v}</span>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full" style={{ minWidth: 40 }}>
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function Medal({ rank }: { rank: number }) {
  if (rank === 1) return <span>🥇</span>
  if (rank === 2) return <span>🥈</span>
  if (rank === 3) return <span>🥉</span>
  return <span className="text-xs text-gray-400 font-bold">#{rank}</span>
}

// ─── Sparkline ────────────────────────────────────────────────────────────────
function Sparkline({ data, color = '#f59e0b' }: { data: number[]; color?: string }) {
  if (!data.length || data.every(d => d === 0)) return <span className="text-gray-200 text-xs">—</span>
  const W = 72, H = 24
  const max = Math.max(...data, 1)
  const pts = data.map((v, i) => {
    const x = data.length < 2 ? W / 2 : (i / (data.length - 1)) * W
    const y = H - (v / max) * (H - 4) - 2
    return `${x},${y}`
  }).join(' ')
  const last = data[data.length - 1]
  const prev = data.length > 1 ? data[data.length - 2] : last
  const dot = last >= prev ? '#10b981' : '#ef4444'
  const lx  = data.length < 2 ? W / 2 : W
  const ly  = H - (last / max) * (H - 4) - 2
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        points={pts} opacity="0.35" />
      <circle cx={lx} cy={ly} r="2.5" fill={dot} />
    </svg>
  )
}

// ─── Heatmap cell ────────────────────────────────────────────────────────────
function HeatCell({ v, max, onClick }: { v: number; max: number; onClick?: () => void }) {
  const pct = max ? v / max : 0
  const bg  = v === 0 ? 'bg-gray-100' : pct < 0.2 ? 'bg-amber-100' : pct < 0.4 ? 'bg-amber-200' : pct < 0.6 ? 'bg-amber-300' : pct < 0.8 ? 'bg-amber-400' : 'bg-amber-500'
  const tc  = pct > 0.6 ? 'text-white' : 'text-gray-700'
  return (
    <div onClick={onClick} title={`${v} contrats`}
      className={`${bg} ${tc} text-xs font-medium flex items-center justify-center rounded cursor-pointer hover:opacity-80 transition-opacity`}
      style={{ minWidth: 32, height: 28 }}>
      {v > 0 ? v : ''}
    </div>
  )
}

// ─── Graphique barres ────────────────────────────────────────────────────────
function BarChart({ data, months }: { data: MonthlyRow[]; months: string[] }) {
  const maxV = Math.max(...data.map(d => d.signes + d.annules), 1)
  return (
    <div className="flex items-end gap-1" style={{ height: 120 }}>
      {months.map(m => {
        const d = data.find(r => r.month === m)
        const s = d?.signes  || 0
        const a = d?.annules || 0
        const hS = Math.round((s / maxV) * 108)
        const hA = Math.round((a / maxV) * 108)
        return (
          <div key={m} className="flex-1 flex flex-col items-center gap-0.5">
            <div className="w-full flex flex-col justify-end" style={{ height: 108 }}>
              {a > 0 && <div className="w-full bg-red-300 rounded-t-sm" style={{ height: hA }} title={`${a} annulés`} />}
              {s > 0 && <div className="w-full bg-amber-400 rounded-t-sm" style={{ height: hS }} title={`${s} signés`} />}
            </div>
            <span className="text-gray-400 text-center w-full truncate" style={{ fontSize: 9 }}>
              {d?.label || m.slice(5)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Panneau commercial ───────────────────────────────────────────────────────
function ComPanel({ com, months, onClose }: { com: ComRow; months: string[]; onClose: () => void }) {
  const instItems  = com.installateurs.map(i => i as unknown as Record<string, unknown>)
  const instSort   = useSort(instItems, 'signes')
  const [sel, setSel] = useState<InstRow | null>(null)
  const maxInst = Math.max(...com.installateurs.map(i => i.signes), 1)

  return (
    <div className="fixed inset-0 z-30 flex">
      <div className="flex-1 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-3xl bg-white shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-5 text-white">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Avatar nom={com.nom} size={12} />
              <div>
                <h2 className="text-xl font-bold">{com.nom}</h2>
                <p className="text-blue-200 text-sm">{com.installateurs.length} installateur{com.installateurs.length > 1 ? 's' : ''}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none">✕</button>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Signés',    value: String(com.signes)         },
              { label: 'CAPEX',     value: fmtK(com.capex)            },
              { label: 'kWc',       value: `${Math.round(com.kwc)}`   },
              { label: 'Taux pose', value: `${com.taux_pose}%`         },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white/10 rounded-lg p-2 text-center">
                <p className="text-white/60 text-xs">{label}</p>
                <p className="text-white font-bold text-lg">{value}</p>
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

          {/* Heatmap */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Heatmap mensuelle</h3>
            <div className="overflow-x-auto">
              <div className="flex gap-1 min-w-max">
                {months.map(m => {
                  const d = com.monthly.find(r => r.month === m)
                  const mx = Math.max(...com.monthly.map(r => r.signes), 1)
                  return (
                    <div key={m} className="flex flex-col items-center gap-1">
                      <HeatCell v={d?.signes || 0} max={mx} />
                      <span className="text-gray-400 whitespace-nowrap" style={{ fontSize: 9 }}>{d?.label || m.slice(5)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Installateurs */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Ses installateurs ({com.installateurs.length})</h3>
            {sel ? (
              <div className="border border-blue-200 rounded-xl overflow-hidden">
                <div className="bg-blue-50 p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setSel(null)} className="text-blue-600 hover:text-blue-800 text-sm">← Retour</button>
                    <span className="font-semibold text-gray-800 text-sm truncate max-w-xs">{sel.nom}</span>
                  </div>
                  <div className="flex gap-3 text-sm">
                    <span><span className="font-bold text-amber-600">{sel.signes}</span> signés</span>
                    <span><span className="font-bold text-emerald-600">{sel.poses}</span> poses</span>
                    <span className="text-gray-500">{fmtK(sel.capex)}</span>
                  </div>
                </div>
                <div className="p-3">
                  <BarChart data={sel.monthly} months={months} />
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {[
                        { label: 'Installateur', k: 'nom'            },
                        { label: 'Signés',        k: 'signes'         },
                        { label: 'Annulés',       k: 'annules'        },
                        { label: 'CAPEX',         k: 'capex'          },
                        { label: 'kWc',           k: 'kwc'            },
                        { label: 'Poses',         k: 'poses'          },
                        { label: 'Taux pose',     k: 'taux_pose'      },
                      ].map(({ label, k }) => (
                        <Th key={k} label={label} k={k} col={instSort.col} dir={instSort.dir} onSort={instSort.toggle} />
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {(instSort.sorted as unknown as InstRow[]).map((inst, i) => (
                      <tr key={i} onClick={() => setSel(inst)}
                        className="hover:bg-blue-50 cursor-pointer transition-colors">
                        <td className="px-3 py-2">
                          <PctBar v={inst.signes} max={maxInst} color="bg-amber-400" />
                          <p className="text-xs text-gray-600 mt-0.5 truncate max-w-[160px]">{inst.nom}</p>
                        </td>
                        <td className="px-3 py-2 font-medium text-gray-800">{inst.signes}</td>
                        <td className="px-3 py-2">
                          <span className={inst.annules > 0 ? 'text-red-500 font-medium' : 'text-gray-300'}>{inst.annules}</span>
                        </td>
                        <td className="px-3 py-2 text-gray-700">{fmtK(inst.capex)}</td>
                        <td className="px-3 py-2 text-gray-600">{inst.kwc.toFixed(1)}</td>
                        <td className="px-3 py-2 text-gray-700">{inst.poses}</td>
                        <td className="px-3 py-2"><TauxPose v={inst.taux_pose} /></td>
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
  const [data, setData]       = useState<ApiData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [annee, setAnnee]     = useState('')
  const [mois, setMois]       = useState('')
  const [view, setView]       = useState<'leaderboard' | 'heatmap' | 'installateurs'>('leaderboard')
  const [selCom, setSelCom]   = useState<ComRow | null>(null)
  const [search, setSearch]   = useState('')

  async function load(yr: string, mo: string) {
    setLoading(true); setError(null)
    try {
      const p = new URLSearchParams()
      if (mo) p.set('mois', mo); else if (yr) p.set('annee', yr)
      const res  = await fetch(`/api/commercial?${p}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setData(json)
    } catch (e) { setError(String(e)) }
    setLoading(false)
  }

  useEffect(() => { load('', '') }, [])

  const comItems  = useMemo(() => (data?.par_commercial  || []) as unknown as Record<string, unknown>[], [data])
  const instItems = useMemo(() => (data?.par_installateur || []) as unknown as Record<string, unknown>[], [data])

  const comSort  = useSort(comItems,  'signes')
  const instSort = useSort(instItems, 'signes')

  const maxCom  = useMemo(() => Math.max(...(data?.par_commercial.map(c => c.signes)  || [1]), 1), [data])
  const maxInst = useMemo(() => Math.max(...(data?.par_installateur.map(i => i.signes) || [1]), 1), [data])
  const heatMax = useMemo(() => {
    if (!data) return 1
    return Math.max(...data.par_commercial.flatMap(c => c.monthly.map(m => m.signes)), 1)
  }, [data])

  const filteredInst = useMemo(() => {
    if (!data) return [] as InstRow[]
    const list = search
      ? data.par_installateur.filter(i => i.nom.toLowerCase().includes(search.toLowerCase()))
      : data.par_installateur
    return list as InstRow[]
  }, [data, search])

  const filteredInstSorted = useMemo(() => {
    const items = filteredInst as unknown as Record<string, unknown>[]
    return [...items].sort((a, b) => {
      const av = a[instSort.col], bv = b[instSort.col]
      if (typeof av === 'number' && typeof bv === 'number')
        return instSort.dir === 'desc' ? bv - av : av - bv
      return 0
    }) as unknown as InstRow[]
  }, [filteredInst, instSort.col, instSort.dir])

  const allMonths = useMemo(() => data?.months.map((m, i) => ({ v: m, l: data.month_labels[i] })) || [], [data])
  const top3      = data?.par_commercial.filter(c => c.nom !== 'Non assigné').slice(0, 3) || []

  const views = [
    { id: 'leaderboard'   as const, label: '🏆 Leaderboard' },
    { id: 'heatmap'       as const, label: '🗓️ Heatmap'     },
    { id: 'installateurs' as const, label: '🏗️ Installateurs' },
  ]

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
            {allMonths.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
          </select>

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

      {selCom && data && (
        <ComPanel com={selCom} months={data.months} onClose={() => setSelCom(null)} />
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
            {/* Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: 'Contrats signés',      value: data.meta.total_signes,             sub: '',                                                   red: false },
                { label: 'Annulés',              value: data.meta.total_annules,            sub: `Taux ${data.meta.taux_annulation_global}%`,           red: true  },
                { label: 'Commerciaux actifs',   value: data.meta.total_commerciaux,        sub: '',                                                   red: false },
                { label: 'Installateurs actifs', value: data.meta.total_installateurs,      sub: '',                                                   red: false },
                { label: "Apporteurs d'affaire", value: data.apporteurs.avec,
                  sub: `${(data.apporteurs.avec + data.apporteurs.sans) > 0 ? Math.round(data.apporteurs.avec / (data.apporteurs.avec + data.apporteurs.sans) * 100) : 0}% du total`,
                  red: false },
              ].map(({ label, value, sub, red }) => (
                <div key={label} className="kpi-card">
                  <p className="kpi-label">{label}</p>
                  <p className={`kpi-value ${red ? 'text-red-500' : ''}`}>{value}</p>
                  {sub && <p className="kpi-sub">{sub}</p>}
                </div>
              ))}
            </div>

            {/* ── LEADERBOARD ── */}
            {view === 'leaderboard' && (
              <div className="space-y-4">
                {/* Podium */}
                {top3.length >= 2 && (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-5">🏆 Top performers</h2>
                    <div className="flex items-end justify-center gap-6">
                      {/* 2e */}
                      {top3[1] && (
                        <div className="flex flex-col items-center gap-2 cursor-pointer" onClick={() => setSelCom(top3[1])}>
                          <Avatar nom={top3[1].nom} size={14} />
                          <div className="text-center">
                            <p className="text-xs text-gray-500 truncate max-w-[80px]">{top3[1].nom.split(' ')[0]}</p>
                            <p className="font-bold text-xl text-gray-800">{top3[1].signes}</p>
                            <p className="text-xs text-gray-400">{fmtK(top3[1].capex)}</p>
                          </div>
                          <div className="w-20 bg-gray-200 rounded-t-lg flex items-center justify-center text-2xl" style={{ height: 60 }}>🥈</div>
                        </div>
                      )}
                      {/* 1er */}
                      {top3[0] && (
                        <div className="flex flex-col items-center gap-2 cursor-pointer" onClick={() => setSelCom(top3[0])}>
                          <div className="relative">
                            <Avatar nom={top3[0].nom} size={18} />
                            <span className="absolute -top-2 -right-2 text-xl">👑</span>
                          </div>
                          <div className="text-center">
                            <p className="text-sm text-gray-600 font-medium truncate max-w-[100px]">{top3[0].nom.split(' ')[0]}</p>
                            <p className="font-bold text-3xl text-gray-900">{top3[0].signes}</p>
                            <p className="text-sm text-gray-500">{fmtK(top3[0].capex)}</p>
                          </div>
                          <div className="w-24 bg-amber-400 rounded-t-lg flex items-center justify-center text-2xl" style={{ height: 80 }}>🥇</div>
                        </div>
                      )}
                      {/* 3e */}
                      {top3[2] && (
                        <div className="flex flex-col items-center gap-2 cursor-pointer" onClick={() => setSelCom(top3[2])}>
                          <Avatar nom={top3[2].nom} size={12} />
                          <div className="text-center">
                            <p className="text-xs text-gray-500 truncate max-w-[70px]">{top3[2].nom.split(' ')[0]}</p>
                            <p className="font-bold text-lg text-gray-800">{top3[2].signes}</p>
                            <p className="text-xs text-gray-400">{fmtK(top3[2].capex)}</p>
                          </div>
                          <div className="w-16 bg-orange-300 rounded-t-lg flex items-center justify-center text-2xl" style={{ height: 45 }}>🥉</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Tableau */}
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
                          <Th label="Volume"     k="signes"          col={comSort.col} dir={comSort.dir} onSort={comSort.toggle} />
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400">Tendance</th>
                          <Th label="CAPEX"      k="capex"           col={comSort.col} dir={comSort.dir} onSort={comSort.toggle} />
                          <Th label="Annulés"    k="annules"         col={comSort.col} dir={comSort.dir} onSort={comSort.toggle} />
                          <Th label="Taux pose"  k="taux_pose"       col={comSort.col} dir={comSort.dir} onSort={comSort.toggle} />
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400">Sparkline 12m</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400">Installs.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {(comSort.sorted as unknown as ComRow[]).map((com, i) => (
                          <tr key={com.nom} onClick={() => setSelCom(com)}
                            className="hover:bg-blue-50 cursor-pointer transition-colors">
                            <td className="px-4 py-3"><Medal rank={i + 1} /></td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <Avatar nom={com.nom} size={8} />
                                <div>
                                  <p className="font-medium text-gray-900 text-sm">{com.nom}</p>
                                  <p className="text-xs text-gray-400">
                                    {com.abo_moyen > 0 ? `Abo. moy. ${fmtFull(com.abo_moyen)}` : '—'}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <PctBar v={com.signes} max={maxCom} color={i < 3 ? 'bg-amber-400' : 'bg-blue-400'} />
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Trend v={com.tendance_signes} />
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-semibold text-gray-800 text-sm">{fmtK(com.capex)}</p>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {com.annules > 0
                                ? <span className="text-red-500 font-medium text-sm">{com.annules} <span className="text-red-400 text-xs">({com.taux_annulation}%)</span></span>
                                : <span className="text-gray-300 text-sm">—</span>}
                            </td>
                            <td className="px-4 py-3 text-center"><TauxPose v={com.taux_pose} /></td>
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

            {/* ── HEATMAP ── */}
            {view === 'heatmap' && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h2 className="font-semibold text-gray-900">Heatmap — Contrats signés par commercial et par mois</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Plus la cellule est foncée, plus le commercial est actif. Cliquez pour le détail.</p>
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
                        <tr key={com.nom} className="hover:bg-gray-50">
                          <td className="pr-4 py-1.5">
                            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setSelCom(com)}>
                              <Avatar nom={com.nom} size={6} />
                              <span className="text-sm font-medium text-gray-700 truncate max-w-[100px]">{com.nom}</span>
                            </div>
                          </td>
                          {data.months.map(m => {
                            const d = com.monthly.find(r => r.month === m)
                            return (
                              <td key={m} className="px-0.5 py-1.5">
                                <HeatCell v={d?.signes || 0} max={heatMax} onClick={() => setSelCom(com)} />
                              </td>
                            )
                          })}
                          <td className="pl-4 py-1.5 text-right">
                            <span className="font-bold text-gray-800">{com.signes}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
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
                <div className="px-5 pb-4 flex items-center gap-2 text-xs text-gray-400">
                  <span>Faible</span>
                  {['bg-gray-100','bg-amber-100','bg-amber-200','bg-amber-300','bg-amber-400','bg-amber-500'].map((c, i) => (
                    <div key={i} className={`w-5 h-4 rounded ${c}`} />
                  ))}
                  <span>Élevé</span>
                </div>
              </div>
            )}

            {/* ── INSTALLATEURS ── */}
            {view === 'installateurs' && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-4">
                  <div className="flex-1">
                    <h2 className="font-semibold text-gray-900">Tous les installateurs</h2>
                    <p className="text-xs text-gray-400 mt-0.5">{filteredInst.length} installateurs</p>
                  </div>
                  <input type="text" placeholder="Rechercher…" value={search} onChange={e => setSearch(e.target.value)}
                    className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-56 focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-10">#</th>
                        <Th label="Installateur"  k="nom"            col={instSort.col} dir={instSort.dir} onSort={instSort.toggle} />
                        <Th label="Signés"         k="signes"         col={instSort.col} dir={instSort.dir} onSort={instSort.toggle} />
                        <Th label="Annulés"        k="annules"        col={instSort.col} dir={instSort.dir} onSort={instSort.toggle} />
                        <Th label="Taux annul."    k="taux_annulation" col={instSort.col} dir={instSort.dir} onSort={instSort.toggle} />
                        <Th label="CAPEX HT"       k="capex"          col={instSort.col} dir={instSort.dir} onSort={instSort.toggle} />
                        <Th label="kWc"            k="kwc"            col={instSort.col} dir={instSort.dir} onSort={instSort.toggle} />
                        <Th label="Poses"          k="poses"          col={instSort.col} dir={instSort.dir} onSort={instSort.toggle} />
                        <Th label="Taux pose"      k="taux_pose"      col={instSort.col} dir={instSort.dir} onSort={instSort.toggle} />
                        <Th label="Durée F2"       k="duree_f2_moy"   col={instSort.col} dir={instSort.dir} onSort={instSort.toggle} />
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Tendance 12m</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredInstSorted.map((inst, i) => (
                        <tr key={inst.nom} className="hover:bg-amber-50 transition-colors">
                          <td className="px-3 py-2.5 text-gray-400 text-xs">{i + 1}</td>
                          <td className="px-3 py-2.5">
                            <p className="font-medium text-gray-800 truncate max-w-[200px]">{inst.nom}</p>
                          </td>
                          <td className="px-3 py-2.5">
                            <PctBar v={inst.signes} max={maxInst} color="bg-amber-400" />
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`font-medium ${inst.annules > 0 ? 'text-red-500' : 'text-gray-300'}`}>{inst.annules}</span>
                          </td>
                          <td className="px-3 py-2.5"><TauxAnnul v={inst.taux_annulation} /></td>
                          <td className="px-3 py-2.5 font-medium text-gray-700">{fmtK(inst.capex)}</td>
                          <td className="px-3 py-2.5 text-gray-600">{inst.kwc.toFixed(1)}</td>
                          <td className="px-3 py-2.5 text-gray-700">{inst.poses}</td>
                          <td className="px-3 py-2.5"><TauxPose v={inst.taux_pose} /></td>
                          <td className="px-3 py-2.5 text-gray-500">
                            {inst.duree_f2_moy > 0 ? `${Math.round(inst.duree_f2_moy)} j` : '—'}
                          </td>
                          <td className="px-3 py-2.5">
                            <Sparkline
                              data={data.months.map(m => inst.monthly.find(r => r.month === m)?.signes || 0)}
                              color="#f59e0b"
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
