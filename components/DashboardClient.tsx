'use client'
import { useState, useEffect, useCallback, type ReactNode } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts'
import MonthlyChart from './MonthlyChart'
import Changelog from './Changelog'
import {
  IconZap, IconFileText, IconWrench, IconBanknote, IconCoins, IconClock,
  IconTrendingUp, IconCheckCircle, IconClipboardList, IconCamera, IconUsers,
  IconLogOut, IconX, IconCheck, IconAlertCircle, IconInbox, IconLoader, IconLandmark,
} from './icons'

type Segment     = 'Tous' | 'Pro' | 'Particulier'
type TypeInstall = 'Tous' | 'PV seul' | 'PV + Batterie' | 'PV + Batterie Virtuelle'
type TabId       = 'signes' | 'poses' | 'capex_signes' | 'capex_poses' | 'kwc' | 'kwc_poses' | 'duree_f2' | 'mrr' | 'mrr_pose'

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
  // MRR souscrit
  total_mrr: number; mrr_pro: number; mrr_part: number
  // MRR posé
  total_mrr_pose: number; mrr_pose_pro: number; mrr_pose_part: number
  par_segment: Record<string, number>
  capex_pro: number; capex_part: number
  kwc_pro: number; kwc_part: number
  par_type_install: Record<string, number>
  par_statut: Record<string, number>
}

interface KPIData {
  global: KPIGlobal
  monthly: unknown[]
  total_records: number
  last_updated: string
}

interface SellsyMonthData {
  month: string; label: string; nb: number; total_ht: number
}

interface SellsyStatusData {
  ca:      { monthly: SellsyMonthData[]; total_ht: number; nb: number }
  caution: { monthly: SellsyMonthData[]; total_ht: number; nb: number }
}

interface SellsyData {
  paid:  SellsyStatusData
  due:   SellsyStatusData
  late:  SellsyStatusData
  last_updated: string
  cache_date: string
}

const fmtEur = (v: number) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR',
    maximumFractionDigits: 0, minimumFractionDigits: 0,
  }).format(v)

const fmtEurK = (v: number) =>
  v >= 1_000_000
    ? `${(v / 1_000_000).toFixed(2)} M€`
    : v >= 1_000
      ? `${(v / 1_000).toFixed(1)}k€`
      : `${Math.round(v)}€`

function KPICard({ label, value, icon, sub, unit = '', decimals = 0, currency = false, highlight = false }: {
  label: string; value: number; icon?: ReactNode; sub?: string
  unit?: string; decimals?: number; currency?: boolean; highlight?: boolean
}) {
  const display = currency ? fmtEur(value) : `${value.toFixed(decimals)}${unit}`
  return (
    <div className={`kpi-card ${highlight ? 'border-l-[3px]' : ''}`} style={highlight ? { borderLeftColor: 'var(--teal)' } : undefined}>
      <div className="flex items-start justify-between mb-1">
        <p className="kpi-label" style={highlight ? { color: 'var(--teal-ink)' } : undefined}>{label}</p>
        {icon && <span className="icon-lg text-muted" style={highlight ? { color: 'var(--teal)' } : undefined}>{icon}</span>}
      </div>
      <p className="kpi-value" style={highlight ? { color: 'var(--teal-ink)' } : undefined}>{display}</p>
      {sub && <p className={`kpi-sub ${highlight ? 'font-semibold' : ''}`} style={highlight ? { color: 'var(--green)' } : undefined}>{sub}</p>}
    </div>
  )
}

function StatBar({ title, data, total }: {
  title: string; data: Record<string, number>; total: number
}) {
  const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 8)
  return (
    <div className="kpi-card">
      <h3 className="kpi-label mb-3">{title}</h3>
      <div className="space-y-2">
        {sorted.map(([k, v]) => (
          <div key={k}>
            <div className="flex justify-between text-sm mb-0.5">
              <span className="text-ink truncate pr-2">{k || '—'}</span>
              <span className="font-medium text-ink flex-shrink-0">
                {v} <span className="text-muted font-normal text-xs">
                  ({Math.round(v / Math.max(total, 1) * 100)}%)
                </span>
              </span>
            </div>
            <div className="h-1.5 bg-line rounded-full">
              <div className="h-1.5 rounded-full" style={{ width: `${Math.round(v / Math.max(total, 1) * 100)}%`, background: 'var(--teal)' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SegmentBars({ g }: { g: KPIGlobal }) {
  const pro  = g.par_segment['Pro']         || 0
  const part = g.par_segment['Particulier'] || 0
  const total = pro + part || 1

  // Pro = teal, Particulier = vert — même paire de couleurs sur toutes les lignes
  // (charte : « une même notion = une même couleur, une même icône, partout »)
  const rows = [
    {
      label: 'Contrats signés',
      proVal: pro,   proFmt: String(pro),
      partVal: part, partFmt: String(part),
      total,
    },
    {
      label: 'kWc signés',
      proVal: g.kwc_pro,   proFmt: `${g.kwc_pro.toFixed(1)} kWc`,
      partVal: g.kwc_part, partFmt: `${g.kwc_part.toFixed(1)} kWc`,
      total: (g.kwc_pro + g.kwc_part) || 1,
    },
    {
      label: 'CAPEX signé HT',
      proVal: g.capex_pro,   proFmt: fmtEurK(g.capex_pro),
      partVal: g.capex_part, partFmt: fmtEurK(g.capex_part),
      total: (g.capex_pro + g.capex_part) || 1,
    },
    {
      label: 'MRR souscrit HT',
      proVal: g.mrr_pro,   proFmt: fmtEurK(g.mrr_pro),
      partVal: g.mrr_part, partFmt: fmtEurK(g.mrr_part),
      total: (g.mrr_pro + g.mrr_part) || 1,
    },
    {
      label: 'MRR posé HT',
      proVal: g.mrr_pose_pro,   proFmt: fmtEurK(g.mrr_pose_pro),
      partVal: g.mrr_pose_part, partFmt: fmtEurK(g.mrr_pose_part),
      total: (g.mrr_pose_pro + g.mrr_pose_part) || 1,
    },
  ]

  return (
    <div className="kpi-card">
      <h3 className="kpi-label mb-4">Répartition segment</h3>
      <div className="space-y-4">
        {rows.map(({ label, proVal, proFmt, partVal, partFmt, total }) => {
          const pctPro  = Math.round(proVal  / total * 100)
          const pctPart = Math.round(partVal / total * 100)
          return (
            <div key={label}>
              <p className="text-xs mb-1.5 text-muted">{label}</p>
              <div className="flex h-2 rounded-full overflow-hidden mb-1.5">
                <div className="transition-all" style={{ width: `${pctPro}%`, background: 'var(--teal)' }} />
                <div className="transition-all" style={{ width: `${pctPart}%`, background: 'var(--green)' }} />
              </div>
              <div className="flex justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm inline-block" style={{ background: 'var(--teal)' }} />
                  <span className="text-muted">Pro</span>
                  <span className="font-semibold text-ink">{proFmt}</span>
                  <span className="text-muted">({pctPro}%)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-muted">({pctPart}%)</span>
                  <span className="font-semibold text-ink">{partFmt}</span>
                  <span className="text-muted">Part.</span>
                  <span className="w-2 h-2 rounded-sm inline-block" style={{ background: 'var(--green)' }} />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Section CA Sellsy ────────────────────────────────────────────────────────
type SellsyTab = 'paid' | 'late'

const SELLSY_TABS: { id: SellsyTab; label: string; icon: ReactNode }[] = [
  { id: 'paid', label: 'Payées',    icon: <IconCheck size={14} /> },
  { id: 'late', label: 'En retard', icon: <IconAlertCircle size={14} /> },
]

const STATUS_COLORS: Record<SellsyTab, { ca: string; caution: string; borderVar: string; textVar: string }> = {
  paid: { ca: 'var(--teal)', caution: 'var(--green)', borderVar: 'var(--teal)',  textVar: 'var(--teal-ink)' },
  late: { ca: 'var(--red)',  caution: 'var(--green)', borderVar: 'var(--red)',   textVar: 'var(--red)'      },
}

function SellsyPanel({ statusData, anneeFilter, tab }: {
  statusData: SellsyStatusData
  anneeFilter: string
  tab: SellsyTab
}) {
  const colors = STATUS_COLORS[tab]

  const caFiltered  = anneeFilter
    ? statusData.ca.monthly.filter(r => r.month.startsWith(anneeFilter))
    : statusData.ca.monthly
  const cauFiltered = anneeFilter
    ? statusData.caution.monthly.filter(r => r.month.startsWith(anneeFilter))
    : statusData.caution.monthly

  const totalCa  = caFiltered.reduce((s, r) => s + r.total_ht, 0)
  const totalCau = cauFiltered.reduce((s, r) => s + r.total_ht, 0)
  const nbCa     = caFiltered.reduce((s, r) => s + r.nb, 0)
  const nbCau    = cauFiltered.reduce((s, r) => s + r.nb, 0)

  const allMonths = Array.from(
    new Set([...caFiltered, ...cauFiltered].map(r => r.month))
  ).sort((a, b) => a.localeCompare(b))

  const chartData = allMonths.map(month => {
    const ca  = caFiltered.find(r => r.month === month)
    const cau = cauFiltered.find(r => r.month === month)
    return {
      label:  ca?.label || cau?.label || month.slice(0, 7),
      ca_ht:  ca?.total_ht  || 0,
      cau_ht: cau?.total_ht || 0,
    }
  })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="kpi-card border-l-[3px]" style={{ borderLeftColor: colors.borderVar }}>
          <p className="kpi-label">CA abonnements HT</p>
          <p className="kpi-value" style={{ color: colors.textVar }}>{fmtEurK(totalCa)}</p>
          <p className="kpi-sub">{nbCa} factures{anneeFilter ? ` en ${anneeFilter}` : ''}</p>
        </div>
        <div className="kpi-card border-l-[3px]" style={{ borderLeftColor: 'var(--green)' }}>
          <p className="kpi-label">Cautions HT</p>
          <p className="kpi-value" style={{ color: 'var(--green)' }}>{fmtEurK(totalCau)}</p>
          <p className="kpi-sub">{nbCau} dépôts{anneeFilter ? ` en ${anneeFilter}` : ''}</p>
        </div>
        <div className="kpi-card border-l-[3px] border-l-line">
          <p className="kpi-label">Total HT</p>
          <p className="kpi-value">{fmtEurK(totalCa + totalCau)}</p>
          <p className="kpi-sub">{nbCa + nbCau} factures au total</p>
        </div>
      </div>

      <div className="bg-canvas rounded-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ background: colors.ca }} />
              CA abonnements
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ background: 'var(--green)' }} />
              Cautions
            </span>
          </div>
        </div>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 4, right: 16, left: 8, bottom: 4 }} barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => fmtEurK(v)} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={65} />
              <Tooltip
                formatter={(value: number, name: string) => [fmtEurK(value), name === 'ca_ht' ? 'CA abonnements HT' : 'Cautions HT']}
                cursor={{ fill: '#f1f5f9' }}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
              <Bar dataKey="ca_ht"  stackId="s" fill={colors.ca} radius={[0, 0, 0, 0]} maxBarSize={40} />
              <Bar dataKey="cau_ht" stackId="s" fill="#3CAE68"   radius={[3, 3, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-center text-muted py-12 text-sm">Aucune donnée pour cette période</p>
        )}
      </div>
    </div>
  )
}

function SellsySection({ data, loading }: { data: SellsyData | null; loading: boolean }) {
  const [anneeFilter, setAnneeFilter] = useState('')
  const [activeTab, setActiveTab]     = useState<SellsyTab>('paid')

  if (loading) return (
    <div className="flex items-center justify-center py-10">
      <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--teal)', borderTopColor: 'transparent' }} />
    </div>
  )
  if (!data) return (
    <div className="text-center py-8 text-muted text-sm">
      <IconInbox size={28} className="mx-auto mb-2 text-muted" />
      <p>Données Sellsy non disponibles</p>
      <p className="text-xs mt-1">Lancez un refresh via <code className="bg-line px-1 rounded">/api/sellsy/refresh</code></p>
    </div>
  )

  const annees = Array.from(
    new Set(data.paid.ca.monthly.map(r => r.month.slice(0, 4)))
  ).sort((a, b) => b.localeCompare(a))

  const currentData = data[activeTab]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="seg" role="tablist">
          {SELLSY_TABS.map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={activeTab === t.id}
              onClick={() => setActiveTab(t.id)}
              className={`seg-btn ${activeTab === t.id ? 'active' : ''}`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={anneeFilter}
            onChange={e => setAnneeFilter(e.target.value)}
            className="text-sm border border-line rounded-control px-3 py-1.5 bg-surface"
          >
            <option value="">Toutes les années</option>
            {annees.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          {anneeFilter && (
            <button onClick={() => setAnneeFilter('')} className="btn btn-ghost px-2 py-1">
              <IconX size={12} />
            </button>
          )}
          <span className="text-xs text-muted">{data.cache_date}</span>
        </div>
      </div>

      <SellsyPanel statusData={currentData} anneeFilter={anneeFilter} tab={activeTab} />
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
  const [sellsy, setSellsy]           = useState<SellsyData | null>(null)
  const [sellsyLoading, setSellsyLoading] = useState(true)

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

  useEffect(() => {
    fetch('/api/sellsy')
      .then(r => r.json())
      .then(j => { if (!j.error) setSellsy(j) })
      .catch(() => {})
      .finally(() => setSellsyLoading(false))
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

  const tabs: { id: TabId; label: string; icon: ReactNode }[] = [
    { id: 'signes',       label: 'Contrats signés', icon: <IconFileText size={14} /> },
    { id: 'poses',        label: 'Poses (F2)',      icon: <IconWrench size={14} />   },
    { id: 'capex_signes', label: 'CAPEX signé',     icon: <IconBanknote size={14} /> },
    { id: 'capex_poses',  label: 'CAPEX posé',      icon: <IconCoins size={14} />    },
    { id: 'kwc',          label: 'kWc signé',       icon: <IconZap size={14} />      },
    { id: 'kwc_poses',    label: 'kWc posé',        icon: <IconZap size={14} />      },
    { id: 'duree_f2',     label: 'Durée F2',        icon: <IconClock size={14} />    },
    { id: 'mrr',          label: 'MRR souscrit',    icon: <IconTrendingUp size={14} /> },
    { id: 'mrr_pose',     label: 'MRR posé',        icon: <IconCheckCircle size={14} /> },
  ]

  const g       = data?.global
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const monthly = (data?.monthly || []) as any[]

  return (
    <div className="min-h-screen bg-canvas">
      <header className="bg-surface border-b border-line sticky top-0 z-10">
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 mr-2">
            <div className="w-7 h-7 bg-brand-gradient rounded-control flex items-center justify-center flex-shrink-0">
              <IconZap size={16} className="text-white" />
            </div>
            <span className="font-bold text-ink text-sm">SunLib KPIs</span>
          </div>

          <div className="flex items-center gap-2 flex-1 flex-wrap">
            <select value={segment}
              onChange={e => applyFilter(e.target.value as Segment, typeInstall, annee)}
              className="text-sm border border-line rounded-control px-3 py-1.5 bg-surface">
              <option value="Tous">Tous segments</option>
              <option value="Pro">Pro</option>
              <option value="Particulier">Particulier</option>
            </select>
            <select value={typeInstall}
              onChange={e => applyFilter(segment, e.target.value as TypeInstall, annee)}
              className="text-sm border border-line rounded-control px-3 py-1.5 bg-surface">
              <option value="Tous">Toutes installations</option>
              <option value="PV seul">PV seul</option>
              <option value="PV + Batterie">PV + Batterie</option>
              <option value="PV + Batterie Virtuelle">PV + Batterie Virtuelle</option>
            </select>
            <select value={annee}
              onChange={e => applyFilter(segment, typeInstall, e.target.value)}
              className="text-sm border border-line rounded-control px-3 py-1.5 bg-surface">
              <option value="">Toutes années</option>
              <option value="2024">2024</option>
              <option value="2025">2025</option>
              <option value="2026">2026</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            {data && (
              <span className="text-xs text-muted hidden sm:block">
                {data.total_records} records · {new Date(data.last_updated).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button onClick={() => setShowLog(!showLog)} className="relative btn btn-ghost">
              <IconClipboardList size={14} /> Journal
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-[var(--red)] text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">
                  {Math.min(unreadCount, 9)}
                </span>
              )}
            </button>
            <button onClick={snapshot} disabled={refreshing} className="btn btn-ghost">
              {refreshing ? <IconLoader size={14} className="animate-spin" /> : <IconCamera size={14} />} Snapshot
            </button>
            <a href="/commercial" className="btn btn-primary">
              <IconUsers size={14} /> Commercial <span className="btn-arrow">→</span>
            </a>
            <button onClick={logout} className="btn text-muted hover:text-ink bg-transparent">
              <IconLogOut size={14} /> Déco
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-4 py-5">
        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="text-center">
              <div className="w-8 h-8 border-2 rounded-full animate-spin mx-auto mb-3" style={{ borderColor: 'var(--teal)', borderTopColor: 'transparent' }} />
              <p className="text-sm text-muted">Chargement des données Airtable…</p>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-card p-5 mb-5" style={{ background: 'var(--red-bg)', border: '1px solid var(--red-border)' }}>
            <p className="font-semibold mb-1" style={{ color: 'var(--red)' }}>Erreur de chargement</p>
            <pre className="text-sm whitespace-pre-wrap break-all" style={{ color: 'var(--red)' }}>{error}</pre>
          </div>
        )}

        {!loading && !error && g && (
          <>
            {/* ─── Ligne 1 : métriques de pose et signature ──────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <KPICard label="Contrats signés"  value={g.total_signes}     icon={<IconFileText />} />
              <KPICard label="Poses réalisées"   value={g.total_poses}      icon={<IconWrench />}
                sub={`${Math.round(g.total_poses / Math.max(g.total_signes, 1) * 100)}% taux pose`} />
              <KPICard label="kWc signés"        value={g.total_kwc_signes} unit=" kWc" icon={<IconZap />} decimals={2} />
              <KPICard label="kWc posés"         value={g.total_kwc_poses}  unit=" kWc" icon={<IconZap />} decimals={2}
                sub={`${Math.round(g.total_kwc_poses / Math.max(g.total_kwc_signes, 1) * 100)}% installé`} />
            </div>

            {/* ─── Ligne 2 : financier ─────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
              <KPICard label="CAPEX signé"      value={g.total_capex_signes} icon={<IconBanknote />} currency />
              <KPICard label="CAPEX posé"       value={g.total_capex_poses}  icon={<IconCoins />} currency />
              <KPICard label="Abo. moyen"       value={g.moy_abonnement}     icon={<IconTrendingUp />} currency />
              <KPICard label="Mandats SEPA"     value={g.mandats_signes}     unit={`/${g.mandats_total}`} icon={<IconLandmark />}
                sub={`${Math.round(g.mandats_signes / Math.max(g.mandats_total, 1) * 100)}% signés`} />
              <KPICard label="MRR souscrit HT"  value={g.total_mrr}          icon={<IconTrendingUp />} currency highlight
                sub={`${Math.round(g.total_mrr * 12 / 1000)}k€/an`} />
              <KPICard label="MRR posé HT"      value={g.total_mrr_pose}     icon={<IconCheckCircle />} currency highlight
                sub={`${Math.round(g.total_mrr_pose * 12 / 1000)}k€/an`} />
            </div>

            {/* ─── Graphique mensuel ───────────────────────────────────────── */}
            <div className="bg-surface rounded-card border border-line shadow-sm mb-4">
              <div className="border-b border-line flex overflow-x-auto">
                {tabs.map(t => (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    className={`tab-underline ${tab === t.id ? 'active' : ''}`}>
                    {t.icon}
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="p-5">
                {monthly.length > 0
                  ? <MonthlyChart data={monthly} metric={tab} showSegments={segment === 'Tous'} />
                  : <p className="text-center text-muted py-16">Aucune donnée pour ces filtres</p>
                }
              </div>
            </div>

            {/* ─── Répartitions ────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <SegmentBars g={g} />
              <StatBar title="Type d'installation"  data={g.par_type_install} total={g.total_signes} />
              <StatBar title="Statut dossiers"
                data={g.par_statut}
                total={Object.values(g.par_statut).reduce((a, b) => a + b, 0)} />
            </div>

            {/* ─── Section CA Sellsy ───────────────────────────────────────── */}
            <div className="bg-surface rounded-card border border-line shadow-sm mb-4">
              <div className="px-5 py-4 border-b border-line flex items-center gap-2">
                <IconCoins size={18} className="text-muted" />
                <div>
                  <h2 className="font-bold text-ink">CA &amp; Cautions — Sellsy</h2>
                  <p className="text-xs text-muted mt-0.5">Factures payées · mis à jour 2x/jour</p>
                </div>
              </div>
              <div className="p-5">
                <SellsySection data={sellsy} loading={sellsyLoading} />
              </div>
            </div>
          </>
        )}
      </main>

      {showLog && (
        <div className="fixed inset-y-0 right-0 w-96 max-w-full bg-surface border-l border-line shadow-xl z-20 flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-line">
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-ink">Journal</h2>
              {unreadCount > 0 && (
                <span className="badge badge-teal">
                  {unreadCount} non lu{unreadCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button onClick={markAsRead} className="btn btn-ghost">
                  <IconCheck size={12} /> Marquer comme lu
                </button>
              )}
              <button onClick={() => setShowLog(false)} className="text-muted hover:text-ink">
                <IconX size={18} />
              </button>
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
