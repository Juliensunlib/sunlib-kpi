'use client'
import { useState, useEffect, useMemo } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────
interface MonthlyRow { month: string; label: string; signes: number; annules: number; capex: number; kwc: number; poses: number }
interface PipelineItem { id: string; nom_abonne: string; installateur: string; segment: string; capex: number; kwc: number; date_creation: string; date_edition: string; date_signature: string; signe: boolean; statut: string; statut_dossier: string; delai_creation_signature: number }
interface PipelineRow { nom: string; total_pipe: number; signes_pipe: number; en_cours_pipe: number; taux_conversion: number; capex_pipe: number; kwc_pipe: number; capex_signe: number; kwc_signe: number; capex_en_cours: number; kwc_en_cours: number; delai_moy: number; items: PipelineItem[] }
interface InstRow { nom: string; signes: number; annules: number; taux_annulation: number; capex: number; kwc: number; poses: number; taux_pose: number; duree_f2_moy: number; delai_moy_creation_signature: number; monthly: MonthlyRow[] }
interface ComRow { nom: string; signes: number; annules: number; taux_annulation: number; capex: number; kwc: number; poses: number; taux_pose: number; abo_moyen: number; duree_f2_moy: number; tendance_signes: number; tendance_capex: number; delai_moy_creation_signature: number; monthly: MonthlyRow[]; installateurs: InstRow[] }
interface ApiData {
  months: string[]; month_labels: string[]
  par_commercial: ComRow[]; par_installateur: InstRow[]
  par_segmentation: Record<string, number>
  pipeline_par_commercial: PipelineRow[]
  pipeline_global: { total: number; signes: number; en_cours: number; taux_conversion: number; capex_pipe: number; capex_signe: number; capex_en_cours: number; kwc_pipe: number; kwc_signe: number; kwc_en_cours: number }
  apporteurs: { avec: number; sans: number }
  meta: { total_signes: number; total_annules: number; taux_annulation_global: number; total_commerciaux: number; total_installateurs: number }
}

type SortDir = 'asc' | 'desc'
type ViewType = 'leaderboard' | 'pipeline' | 'heatmap' | 'installateurs'

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmtK = (v: number) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M€` : v >= 1_000 ? `${Math.round(v / 1_000)}k€` : `${Math.round(v)}€`
const fmtFull = (v: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
const fmtDate = (s: string) => { if (!s) return '—'; try { return new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) } catch { return s.slice(0, 10) } }

// ─── Avatar ───────────────────────────────────────────────────────────────────
function initials(s: string) { const p = s.trim().split(' ').filter(Boolean); return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : s.slice(0, 2).toUpperCase() }
const COLORS = ['bg-blue-500','bg-violet-500','bg-emerald-500','bg-amber-500','bg-rose-500','bg-cyan-500','bg-indigo-500','bg-teal-500','bg-orange-500','bg-pink-500','bg-lime-600','bg-sky-500']
function avatarBg(s: string) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff; return COLORS[Math.abs(h) % COLORS.length] }
function Avatar({ nom, size = 8 }: { nom: string; size?: number }) {
  return <div className={`rounded-lg flex items-center justify-center text-white font-bold flex-shrink-0 ${avatarBg(nom)}`} style={{ width: size * 4, height: size * 4, fontSize: Math.max(size * 1.5, 10) }}>{initials(nom)}</div>
}

// ─── Hook tri ─────────────────────────────────────────────────────────────────
function useSort(items: Record<string, unknown>[], def: string) {
  const [col, setCol] = useState(def)
  const [dir, setDir] = useState<SortDir>('desc')
  const sorted = [...items].sort((a, b) => {
    const av = a[col], bv = b[col]
    if (typeof av === 'number' && typeof bv === 'number') return dir === 'desc' ? bv - av : av - bv
    return dir === 'desc' ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv))
  })
  const toggle = (k: string) => { if (k === col) setDir(d => d === 'desc' ? 'asc' : 'desc'); else { setCol(k); setDir('desc') } }
  return { sorted, col, dir, toggle }
}

// ─── UI ───────────────────────────────────────────────────────────────────────
function Th({ label, k, col, dir, onSort }: { label: string; k: string; col: string; dir: SortDir; onSort: (k: string) => void }) {
  const active = k === col
  return <th onClick={() => onSort(k)} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-800 whitespace-nowrap"><span className="flex items-center gap-1">{label}<span className={`text-xs ${active ? 'text-amber-500' : 'text-gray-300'}`}>{active ? (dir === 'desc' ? '↓' : '↑') : '↕'}</span></span></th>
}

function PctBar({ v, max, color = 'bg-blue-400' }: { v: number; max: number; color?: string }) {
  const pct = max ? Math.min(Math.round(v / max * 100), 100) : 0
  return <div className="flex items-center gap-2"><div className="flex-1 h-1.5 bg-gray-100 rounded-full" style={{ minWidth: 40 }}><div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} /></div></div>
}

function PctBarCount({ v, max, color = 'bg-blue-400' }: { v: number; max: number; color?: string }) {
  const pct = max ? Math.min(Math.round(v / max * 100), 100) : 0
  return <div className="flex items-center gap-2"><span className="text-sm font-medium text-gray-800 w-6 text-right">{v}</span><div className="flex-1 h-1.5 bg-gray-100 rounded-full" style={{ minWidth: 40 }}><div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} /></div></div>
}

function TauxPose({ v }: { v: number }) {
  const cls = v >= 70 ? 'text-emerald-600' : v >= 40 ? 'text-amber-600' : 'text-gray-400'
  return <span className={`text-sm font-semibold ${cls}`}>{v}%</span>
}

function Medal({ rank }: { rank: number }) {
  if (rank === 1) return <span>🥇</span>; if (rank === 2) return <span>🥈</span>; if (rank === 3) return <span>🥉</span>
  return <span className="text-xs text-gray-400 font-bold">#{rank}</span>
}

function Trend({ v }: { v: number }) {
  if (v === 0) return <span className="text-gray-300 text-xs">—</span>
  return <span className={`text-xs font-semibold ${v > 0 ? 'text-emerald-600' : 'text-red-500'}`}>{v > 0 ? '↑' : '↓'} {Math.abs(v)}</span>
}

function Sparkline({ data, color = '#f59e0b' }: { data: number[]; color?: string }) {
  if (!data.length || data.every(d => d === 0)) return <span className="text-gray-200 text-xs">—</span>
  const W = 72, H = 24, max = Math.max(...data, 1)
  const pts = data.map((v, i) => { const x = data.length < 2 ? W / 2 : (i / (data.length - 1)) * W; const y = H - (v / max) * (H - 4) - 2; return `${x},${y}` }).join(' ')
  const last = data[data.length - 1], prev = data.length > 1 ? data[data.length - 2] : last
  const dot = last >= prev ? '#10b981' : '#ef4444'
  const lx = data.length < 2 ? W / 2 : W, ly = H - (last / max) * (H - 4) - 2
  return <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible"><polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={pts} opacity="0.35" /><circle cx={lx} cy={ly} r="2.5" fill={dot} /></svg>
}

function HeatCell({ v, max, onClick, selected = false }: { v: number; max: number; onClick?: () => void; selected?: boolean }) {
  const pct = max ? v / max : 0
  const bg  = v === 0 ? 'bg-gray-100' : pct < 0.2 ? 'bg-amber-100' : pct < 0.4 ? 'bg-amber-200' : pct < 0.6 ? 'bg-amber-300' : pct < 0.8 ? 'bg-amber-400' : 'bg-amber-500'
  const tc  = pct > 0.6 ? 'text-white' : 'text-gray-700'
  return <div onClick={onClick} title={`${v}`} className={`${bg} ${tc} text-xs font-medium flex items-center justify-center rounded cursor-pointer hover:opacity-80 transition-all ${selected ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`} style={{ minWidth: 32, height: 28 }}>{v > 0 ? v : ''}</div>
}

function BarChart({ data, months }: { data: MonthlyRow[]; months: string[] }) {
  const maxV = Math.max(...data.map(d => d.signes + d.annules), 1)
  return (
    <div className="flex items-end gap-1" style={{ height: 120 }}>
      {months.map(m => {
        const d = data.find(r => r.month === m)
        const s = d?.signes || 0, a = d?.annules || 0
        return (
          <div key={m} className="flex-1 flex flex-col items-center gap-0.5">
            <div className="w-full flex flex-col justify-end" style={{ height: 108 }}>
              {a > 0 && <div className="w-full bg-red-300 rounded-t-sm" style={{ height: Math.round((a / maxV) * 108) }} />}
              {s > 0 && <div className="w-full bg-amber-400 rounded-t-sm" style={{ height: Math.round((s / maxV) * 108) }} />}
            </div>
            <span className="text-gray-400 text-center w-full truncate" style={{ fontSize: 9 }}>{d?.label || m.slice(5)}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Panneau Pipeline ─────────────────────────────────────────────────────────
function PipelinePanel({ pipe, onClose }: { pipe: PipelineRow; onClose: () => void }) {
  const [tab, setTab] = useState<'tous' | 'signes' | 'en_cours'>('tous')
  const items = pipe.items.filter(i => tab === 'tous' ? true : tab === 'signes' ? i.signe : !i.signe)
  return (
    <div className="fixed inset-0 z-30 flex">
      <div className="flex-1 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-2xl bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 p-5 text-white">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3"><Avatar nom={pipe.nom} size={12} /><div><h2 className="text-xl font-bold">{pipe.nom}</h2><p className="text-indigo-200 text-sm">Pipeline 30 jours glissants</p></div></div>
            <button onClick={onClose} className="text-white/60 hover:text-white text-2xl">✕</button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[{ label: 'En pipe', value: String(pipe.total_pipe) }, { label: 'Signés', value: String(pipe.signes_pipe) }, { label: 'Taux conv.', value: `${pipe.taux_conversion}%` }, { label: 'Délai moy.', value: pipe.delai_moy > 0 ? `${pipe.delai_moy}j` : '—' }].map(({ label, value }) => (
              <div key={label} className="bg-white/10 rounded-lg p-2 text-center"><p className="text-white/60 text-xs">{label}</p><p className="text-white font-bold text-lg">{value}</p></div>
            ))}
          </div>
        </div>
        <div className="px-5 py-3 bg-indigo-50 border-b border-indigo-100">
          <div className="flex items-center justify-between text-xs text-indigo-700 mb-1">
            <span>{pipe.signes_pipe} signés sur {pipe.total_pipe} dossiers</span>
            <span>{fmtK(pipe.capex_signe)} / {fmtK(pipe.capex_pipe)} CAPEX</span>
          </div>
          <div className="h-2 bg-indigo-200 rounded-full"><div className="h-2 bg-indigo-500 rounded-full" style={{ width: `${pipe.total_pipe ? Math.round(pipe.signes_pipe / pipe.total_pipe * 100) : 0}%` }} /></div>
        </div>
        <div className="flex border-b border-gray-100">
          {([['tous', `Tous (${pipe.items.length})`], ['signes', `Signés (${pipe.signes_pipe})`], ['en_cours', `En cours (${pipe.total_pipe - pipe.signes_pipe})`]] as [string, string][]).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id as 'tous' | 'signes' | 'en_cours')} className={`px-4 py-2.5 text-sm border-b-2 transition-colors ${tab === id ? 'border-indigo-500 text-indigo-600 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{label}</button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Abonné</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">Installateur</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">CAPEX</th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500">Création</th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500">Édition</th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500">Statut</th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500">Délai</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2.5"><p className="font-medium text-gray-800 text-sm truncate max-w-[140px]">{item.nom_abonne}</p><p className="text-xs text-gray-400">{item.segment}</p></td>
                  <td className="px-3 py-2.5"><p className="text-xs text-gray-600 truncate max-w-[120px]">{item.installateur}</p></td>
                  <td className="px-3 py-2.5 text-right font-medium text-gray-700">{fmtK(item.capex)}</td>
                  <td className="px-3 py-2.5 text-center text-xs text-gray-500">{fmtDate(item.date_creation)}</td>
                  <td className="px-3 py-2.5 text-center text-xs text-gray-500">{fmtDate(item.date_edition)}</td>
                  <td className="px-3 py-2.5 text-center">{item.signe ? <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">✓ Signé</span> : <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">En cours</span>}</td>
                  <td className="px-3 py-2.5 text-center text-xs text-gray-500">{item.delai_creation_signature >= 0 ? `${item.delai_creation_signature}j` : '—'}</td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400 text-sm">Aucun dossier</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Panneau commercial ───────────────────────────────────────────────────────
function ComPanel({ com, months, onClose }: { com: ComRow; months: string[]; onClose: () => void }) {
  const instItems = com.installateurs as unknown as Record<string, unknown>[]
  const instSort  = useSort(instItems, 'signes')
  const [sel, setSel]           = useState<InstRow | null>(null)
  const [selMonth, setSelMonth] = useState<string | null>(null)

  const maxInst      = Math.max(...com.installateurs.map(i => i.signes), 1)
  const monthData    = selMonth ? com.monthly.find(r => r.month === selMonth) : null
  const mLabel       = monthData?.label || selMonth?.slice(5) || ''

  const instForMonth = selMonth
    ? com.installateurs
        .map(inst => {
          const m = inst.monthly.find(r => r.month === selMonth)
          return { ...inst, signes: m?.signes || 0, annules: m?.annules || 0, capex: m?.capex || 0, kwc: m?.kwc || 0, poses: m?.poses || 0 }
        })
        .filter(i => i.signes + i.annules > 0)
        .sort((a, b) => b.signes - a.signes)
    : (instSort.sorted as unknown as InstRow[])

  const maxInstMonth = Math.max(...instForMonth.map(i => i.signes), 1)

  return (
    <div className="fixed inset-0 z-30 flex">
      <div className="flex-1 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-3xl bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-5 text-white">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Avatar nom={com.nom} size={12} />
              <div>
                <h2 className="text-xl font-bold">{com.nom}</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-blue-200 text-sm">{com.installateurs.length} installateurs</p>
                  {selMonth && <span className="flex items-center gap-1 bg-white/20 text-white text-xs px-2 py-0.5 rounded-full">📅 {mLabel}<button onClick={() => { setSelMonth(null); setSel(null) }} className="ml-1 hover:text-red-300">✕</button></span>}
                </div>
              </div>
            </div>
            <button onClick={onClose} className="text-white/60 hover:text-white text-2xl">✕</button>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {selMonth ? (
              <>
                {[{ label: `Signés ${mLabel}`, value: String(monthData?.signes || 0) }, { label: 'Annulés', value: String(monthData?.annules || 0) }, { label: 'CAPEX', value: fmtK(monthData?.capex || 0) }, { label: 'kWc', value: String(Math.round(monthData?.kwc || 0)) }, { label: 'Poses', value: String(monthData?.poses || 0) }].map(({ label, value }) => (
                  <div key={label} className="bg-white/10 rounded-lg p-2 text-center"><p className="text-white/60 text-xs">{label}</p><p className="text-white font-bold text-lg">{value}</p></div>
                ))}
              </>
            ) : (
              <>
                {[{ label: 'Signés', value: String(com.signes) }, { label: 'CAPEX', value: fmtK(com.capex) }, { label: 'kWc', value: `${Math.round(com.kwc)}` }, { label: 'Taux pose', value: `${com.taux_pose}%` }, { label: 'Délai sig.', value: com.delai_moy_creation_signature > 0 ? `${com.delai_moy_creation_signature}j` : '—' }].map(({ label, value }) => (
                  <div key={label} className="bg-white/10 rounded-lg p-2 text-center"><p className="text-white/60 text-xs">{label}</p><p className="text-white font-bold">{value}</p></div>
                ))}
              </>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!selMonth && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Activité mensuelle</h3>
              <BarChart data={com.monthly} months={months} />
              <div className="flex gap-4 mt-1 text-xs text-gray-400">
                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-400 rounded-sm inline-block" /> Signés</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-300 rounded-sm inline-block" /> Annulés</span>
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700">
                Heatmap {selMonth && <span className="text-blue-600 ml-1">· {mLabel} sélectionné</span>}
              </h3>
              {selMonth && <button onClick={() => { setSelMonth(null); setSel(null) }} className="text-xs text-gray-400 hover:text-gray-700">Voir tout ×</button>}
            </div>
            <div className="overflow-x-auto">
              <div className="flex gap-1 min-w-max">
                {months.map(m => {
                  const d = com.monthly.find(r => r.month === m)
                  const mx = Math.max(...com.monthly.map(r => r.signes), 1)
                  return (
                    <div key={m} className="flex flex-col items-center gap-1">
                      <HeatCell v={d?.signes || 0} max={mx} selected={selMonth === m} onClick={() => { setSelMonth(selMonth === m ? null : m); setSel(null) }} />
                      <span className={`whitespace-nowrap text-center ${selMonth === m ? 'text-blue-600 font-semibold' : 'text-gray-400'}`} style={{ fontSize: 9 }}>{d?.label || m.slice(5)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              {selMonth ? `Installateurs actifs en ${mLabel} (${instForMonth.length})` : `Ses installateurs (${com.installateurs.length})`}
            </h3>
            {sel ? (
              <div className="border border-blue-200 rounded-xl overflow-hidden">
                <div className="bg-blue-50 p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setSel(null)} className="text-blue-600 hover:text-blue-800 text-sm">← Retour</button>
                    <span className="font-semibold text-gray-800 text-sm truncate max-w-xs">{sel.nom}</span>
                  </div>
                  <div className="flex gap-3 text-sm">
                    <span><span className="font-bold text-amber-600">{selMonth ? (sel.monthly.find(r => r.month === selMonth)?.signes || 0) : sel.signes}</span> signés</span>
                    <span className="text-gray-500">{fmtK(selMonth ? (sel.monthly.find(r => r.month === selMonth)?.capex || 0) : sel.capex)}</span>
                  </div>
                </div>
                <div className="p-3">
                  {selMonth ? (
                    <div className="text-center py-6 text-gray-400 text-sm">
                      <p className="text-3xl font-bold text-gray-700 mb-1">{sel.monthly.find(r => r.month === selMonth)?.signes || 0}</p>
                      <p>contrats signés en {mLabel}</p>
                      <p className="text-xs mt-1">{fmtK(sel.monthly.find(r => r.month === selMonth)?.capex || 0)} CAPEX · {(sel.monthly.find(r => r.month === selMonth)?.kwc || 0).toFixed(1)} kWc</p>
                    </div>
                  ) : <BarChart data={sel.monthly} months={months} />}
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {!selMonth ? (
                        [{ label: 'Installateur', k: 'nom' }, { label: 'Signés', k: 'signes' }, { label: 'Annulés', k: 'annules' }, { label: 'CAPEX', k: 'capex' }, { label: 'Poses', k: 'poses' }, { label: 'Taux pose', k: 'taux_pose' }, { label: 'Délai sig.', k: 'delai_moy_creation_signature' }].map(({ label, k }) => (
                          <Th key={k} label={label} k={k} col={instSort.col} dir={instSort.dir} onSort={instSort.toggle} />
                        ))
                      ) : (
                        ['Installateur', 'Signés', 'Annulés', 'CAPEX', 'kWc', 'Poses'].map(l => (
                          <th key={l} className="px-3 py-1.5 text-left text-xs font-semibold text-gray-500">{l}</th>
                        ))
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {instForMonth.map((inst, i) => (
                      <tr key={i} onClick={() => setSel(com.installateurs.find(ci => ci.nom === inst.nom) || null)} className="hover:bg-blue-50 cursor-pointer transition-colors">
                        <td className="px-3 py-2">
                          <PctBarCount v={inst.signes} max={selMonth ? maxInstMonth : maxInst} color="bg-amber-400" />
                          <p className="text-xs text-gray-600 mt-0.5 truncate max-w-[160px]">{inst.nom}</p>
                        </td>
                        <td className="px-3 py-2 font-medium text-gray-800">{inst.signes}</td>
                        <td className="px-3 py-2"><span className={inst.annules > 0 ? 'text-red-500 font-medium' : 'text-gray-300'}>{inst.annules || '—'}</span></td>
                        <td className="px-3 py-2 text-gray-700">{fmtK(inst.capex)}</td>
                        <td className="px-3 py-2 text-gray-600">{inst.kwc.toFixed(1)}</td>
                        <td className="px-3 py-2 text-gray-700">{inst.poses}</td>
                        {!selMonth && <td className="px-3 py-2"><TauxPose v={inst.taux_pose} /></td>}
                        {!selMonth && <td className="px-3 py-2 text-gray-500 text-xs">{inst.delai_moy_creation_signature > 0 ? `${inst.delai_moy_creation_signature}j` : '—'}</td>}
                      </tr>
                    ))}
                    {instForMonth.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400 text-sm">Aucune activité ce mois</td></tr>}
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
  const [view, setView]       = useState<ViewType>('leaderboard')
  const [selCom, setSelCom]   = useState<ComRow | null>(null)
  const [selPipe, setSelPipe] = useState<PipelineRow | null>(null)
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
  const pipeItems = useMemo(() => (data?.pipeline_par_commercial || []) as unknown as Record<string, unknown>[], [data])

  const comSort  = useSort(comItems,  'capex')
  const instSort = useSort(instItems, 'signes')
  const pipeSort = useSort(pipeItems, 'total_pipe')

  const maxCom  = useMemo(() => Math.max(...(data?.par_commercial.map(c => c.capex)  || [1]), 1), [data])
  const maxInst = useMemo(() => Math.max(...(data?.par_installateur.map(i => i.signes) || [1]), 1), [data])
  const maxPipe = useMemo(() => Math.max(...(data?.pipeline_par_commercial.map(p => p.en_cours_pipe) || [1]), 1), [data])
  const heatMax = useMemo(() => data ? Math.max(...data.par_commercial.flatMap(c => c.monthly.map(m => m.signes)), 1) : 1, [data])

  const filteredInstSorted = useMemo(() => {
    if (!data) return [] as InstRow[]
    const list = search ? data.par_installateur.filter(i => i.nom.toLowerCase().includes(search.toLowerCase())) : data.par_installateur
    return [...list].sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[instSort.col]
      const bv = (b as unknown as Record<string, unknown>)[instSort.col]
      if (typeof av === 'number' && typeof bv === 'number') return instSort.dir === 'desc' ? bv - av : av - bv
      return 0
    }) as InstRow[]
  }, [data, search, instSort.col, instSort.dir])

  const allMonths = useMemo(() => data?.months.map((m, i) => ({ v: m, l: data.month_labels[i] })) || [], [data])
  const top3 = [...(data?.par_commercial.filter(c => c.nom !== 'Non assigné') || [])].sort((a, b) => b.capex - a.capex).slice(0, 3)

  const views: { id: ViewType; label: string }[] = [
    { id: 'leaderboard',   label: '🏆 Leaderboard'    },
    { id: 'pipeline',      label: '🔄 Pipeline 30j'    },
    { id: 'heatmap',       label: '🗓️ Heatmap'         },
    { id: 'installateurs', label: '🏗️ Installateurs'   },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 mr-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center"><span className="text-white text-sm">👥</span></div>
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
          <a href="/dashboard" className="text-sm px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">← Production</a>
        </div>
      </header>

      {selCom  && data && <ComPanel      com={selCom}   months={data.months} onClose={() => setSelCom(null)} />}
      {selPipe && data && <PipelinePanel pipe={selPipe} onClose={() => setSelPipe(null)} />}

      <main className="max-w-screen-2xl mx-auto px-4 py-5 space-y-4">
        {loading && (
          <div className="flex items-center justify-center py-32">
            <div className="text-center">
              <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-500">Chargement des données CRM…</p>
            </div>
          </div>
        )}
        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-5"><p className="font-semibold text-red-700">{error}</p></div>}

        {!loading && !error && data && (
          <>
            {/* Cards globales */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: 'Contrats signés',      value: data.meta.total_signes,        sub: '',                                               red: false },
                { label: 'Annulés',              value: data.meta.total_annules,       sub: `Taux ${data.meta.taux_annulation_global}%`,       red: true  },
                { label: 'Commerciaux actifs',   value: data.meta.total_commerciaux,   sub: '',                                               red: false },
                { label: 'Installateurs actifs', value: data.meta.total_installateurs, sub: '',                                               red: false },
                { label: 'Pipeline 30j',         value: data.pipeline_global.en_cours,    sub: `À signer · ${fmtK(data.pipeline_global.capex_en_cours)} CAPEX`, red: false },
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
                {/* Podium — trié par CAPEX */}
                {top3.length >= 2 && (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-5">🏆 Top performers — CAPEX</h2>
                    <div className="flex items-end justify-center gap-6">
                      {top3[1] && (
                        <div className="flex flex-col items-center gap-2 cursor-pointer" onClick={() => setSelCom(top3[1])}>
                          <Avatar nom={top3[1].nom} size={14} />
                          <div className="text-center">
                            <p className="text-xs text-gray-500">{top3[1].nom.split(' ')[0]}</p>
                            <p className="font-bold text-xl text-gray-800">{fmtK(top3[1].capex)}</p>
                            <p className="text-xs text-gray-400">{top3[1].signes} contrats</p>
                          </div>
                          <div className="w-20 bg-gray-200 rounded-t-lg flex items-center justify-center text-2xl" style={{ height: 60 }}>🥈</div>
                        </div>
                      )}
                      {top3[0] && (
                        <div className="flex flex-col items-center gap-2 cursor-pointer" onClick={() => setSelCom(top3[0])}>
                          <div className="relative"><Avatar nom={top3[0].nom} size={18} /><span className="absolute -top-2 -right-2 text-xl">👑</span></div>
                          <div className="text-center">
                            <p className="text-sm text-gray-600 font-medium">{top3[0].nom.split(' ')[0]}</p>
                            <p className="font-bold text-3xl text-gray-900">{fmtK(top3[0].capex)}</p>
                            <p className="text-sm text-gray-500">{top3[0].signes} contrats</p>
                          </div>
                          <div className="w-24 bg-amber-400 rounded-t-lg flex items-center justify-center text-2xl" style={{ height: 80 }}>🥇</div>
                        </div>
                      )}
                      {top3[2] && (
                        <div className="flex flex-col items-center gap-2 cursor-pointer" onClick={() => setSelCom(top3[2])}>
                          <Avatar nom={top3[2].nom} size={12} />
                          <div className="text-center">
                            <p className="text-xs text-gray-500">{top3[2].nom.split(' ')[0]}</p>
                            <p className="font-bold text-lg text-gray-800">{fmtK(top3[2].capex)}</p>
                            <p className="text-xs text-gray-400">{top3[2].signes} contrats</p>
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
                    <div><h2 className="font-semibold text-gray-900">Classement commerciaux</h2><p className="text-xs text-gray-400 mt-0.5">Trié par CAPEX · Cliquez pour voir le détail</p></div>
                    <span className="text-xs text-gray-400">{data.par_commercial.length} commerciaux</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 w-10">#</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Commercial</th>
                          <Th label="CAPEX HT"   k="capex"                        col={comSort.col} dir={comSort.dir} onSort={comSort.toggle} />
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400">Tendance</th>
                          <Th label="Signés"     k="signes"                       col={comSort.col} dir={comSort.dir} onSort={comSort.toggle} />
                          <Th label="Annulés"    k="annules"                      col={comSort.col} dir={comSort.dir} onSort={comSort.toggle} />
                          <Th label="Taux pose"  k="taux_pose"                    col={comSort.col} dir={comSort.dir} onSort={comSort.toggle} />
                          <Th label="Délai sig." k="delai_moy_creation_signature" col={comSort.col} dir={comSort.dir} onSort={comSort.toggle} />
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400">Sparkline</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-400">Installs.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {(comSort.sorted as unknown as ComRow[]).map((com, i) => (
                          <tr key={com.nom} onClick={() => setSelCom(com)} className="hover:bg-blue-50 cursor-pointer transition-colors">
                            <td className="px-4 py-3"><Medal rank={i + 1} /></td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <Avatar nom={com.nom} size={8} />
                                <div>
                                  <p className="font-medium text-gray-900 text-sm">{com.nom}</p>
                                  <p className="text-xs text-gray-400">{com.abo_moyen > 0 ? `Abo. moy. ${fmtFull(com.abo_moyen)}` : '—'}</p>
                                </div>
                              </div>
                            </td>
                            {/* ← Colonne CAPEX avec barre de progression */}
                            <td className="px-4 py-3">
                              <PctBar v={com.capex} max={maxCom} color={i < 3 ? 'bg-amber-400' : 'bg-blue-400'} />
                              <p className="text-sm font-semibold text-gray-800 mt-0.5">{fmtK(com.capex)}</p>
                            </td>
                            <td className="px-4 py-3 text-center"><Trend v={com.tendance_signes} /></td>
                            {/* ← Colonne Signés en secondaire */}
                            <td className="px-4 py-3 text-gray-700 text-sm">
                              {com.signes} <span className="text-xs text-gray-400">contrats</span>
                            </td>
                            <td className="px-4 py-3 text-center">{com.annules > 0 ? <span className="text-red-500 font-medium text-sm">{com.annules} <span className="text-red-400 text-xs">({com.taux_annulation}%)</span></span> : <span className="text-gray-300 text-sm">—</span>}</td>
                            <td className="px-4 py-3 text-center"><TauxPose v={com.taux_pose} /></td>
                            <td className="px-4 py-3 text-center text-sm text-gray-600">{com.delai_moy_creation_signature > 0 ? `${com.delai_moy_creation_signature}j` : '—'}</td>
                            <td className="px-4 py-3 flex justify-center"><Sparkline data={data.months.map(m => com.monthly.find(r => r.month === m)?.signes || 0)} color={i < 3 ? '#f59e0b' : '#60a5fa'} /></td>
                            <td className="px-4 py-3 text-center text-sm text-gray-600 font-medium">{com.installateurs.length}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── PIPELINE ── */}
            {view === 'pipeline' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: 'À signer',             value: String(data.pipeline_global.en_cours),         sub: `${data.pipeline_global.total} dossiers au total`     },
                    { label: 'CAPEX restant à signer',value: fmtK(data.pipeline_global.capex_en_cours),    sub: `${fmtK(data.pipeline_global.capex_signe)} déjà signé`},
                    { label: 'Déjà signés',          value: String(data.pipeline_global.signes),           sub: `Taux ${data.pipeline_global.taux_conversion}%`        },
                    { label: 'kWc à signer',         value: `${Math.round(data.pipeline_global.kwc_en_cours)} kWc`, sub: `${Math.round(data.pipeline_global.kwc_signe)} kWc signés` },
                  ].map(({ label, value, sub }) => (
                    <div key={label} className="kpi-card border-l-4 border-l-indigo-400">
                      <p className="kpi-label">{label}</p><p className="kpi-value">{value}</p>{sub && <p className="kpi-sub">{sub}</p>}
                    </div>
                  ))}
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100">
                    <h2 className="font-semibold text-gray-900">Pipeline 30 jours par commercial</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Dossiers créés ou édités dans les 30 derniers jours · Cliquez pour voir les dossiers</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 w-10">#</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Commercial</th>
                          <Th label="À signer"    k="en_cours_pipe"
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400">Progression</th>
                          <Th label="Signés"      k="signes_pipe"     col={pipeSort.col} dir={pipeSort.dir} onSort={pipeSort.toggle} />
                          <Th label="Taux conv."  k="taux_conversion" col={pipeSort.col} dir={pipeSort.dir} onSort={pipeSort.toggle} />
                          <Th label="CAPEX à signer" k="capex_en_cours" col={pipeSort.col} dir={pipeSort.dir} onSort={pipeSort.toggle} />
                          <Th label="CAPEX signé"    k="capex_signe"
                          <Th label="kWc"         k="kwc_signe"       col={pipeSort.col} dir={pipeSort.dir} onSort={pipeSort.toggle} />
                          <Th label="Délai moy."  k="delai_moy"       col={pipeSort.col} dir={pipeSort.dir} onSort={pipeSort.toggle} />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {(pipeSort.sorted as unknown as PipelineRow[]).map((pipe, i) => (
                          <tr key={pipe.nom} onClick={() => setSelPipe(pipe)} className="hover:bg-indigo-50 cursor-pointer transition-colors">
                            <td className="px-4 py-3 text-gray-400 text-xs">{i + 1}</td>
                            <td className="px-4 py-3"><div className="flex items-center gap-2"><Avatar nom={pipe.nom} size={8} /><span className="font-medium text-gray-900 text-sm">{pipe.nom}</span></div></td>
                            <td className="px-4 py-3"><PctBarCount v={pipe.en_cours_pipe} max={maxPipe} color="bg-orange-400" /></td>
                            <td className="px-4 py-3" style={{ minWidth: 120 }}>
                              <div className="h-2 bg-gray-100 rounded-full"><div className="h-2 bg-indigo-500 rounded-full" style={{ width: `${pipe.total_pipe ? Math.round(pipe.signes_pipe / pipe.total_pipe * 100) : 0}%` }} /></div>
                              <p className="text-xs text-gray-400 mt-0.5">{pipe.signes_pipe}/{pipe.total_pipe} signés</p>
                            </td>
                            <td className="px-4 py-3 font-medium text-emerald-600">{pipe.signes_pipe}</td>
                            <td className="px-4 py-3"><span className={`font-semibold text-sm ${pipe.taux_conversion >= 70 ? 'text-emerald-600' : pipe.taux_conversion >= 40 ? 'text-amber-600' : 'text-gray-400'}`}>{pipe.taux_conversion}%</span></td>
                            <td className="px-4 py-3 font-bold text-orange-600">{fmtK(pipe.capex_en_cours)}</td>
                            <td className="px-4 py-3 text-gray-600">{fmtK(pipe.capex_signe)}</td>
                            <td className="px-4 py-3 font-medium text-emerald-600">{pipe.signes_pipe}</td>
                            <td className="px-4 py-3"><span className={`font-semibold text-sm ${pipe.taux_conversion >= 70 ? 'text-emerald-600' : pipe.taux_conversion >= 40 ? 'text-amber-600' : 'text-gray-400'}`}>{pipe.taux_conversion}%</span></td>
                            <td className="px-4 py-3 text-gray-600">{fmtK(pipe.capex_pipe)}</td>
                            <td className="px-4 py-3 font-medium text-gray-800">{fmtK(pipe.capex_signe)}</td>
                            <td className="px-4 py-3 text-gray-600">{pipe.kwc_signe.toFixed(1)}</td>
                            <td className="px-4 py-3 text-gray-500 text-sm">{pipe.delai_moy > 0 ? `${pipe.delai_moy}j` : '—'}</td>
                          </tr>
                        ))}
                        {data.pipeline_par_commercial.length === 0 && <tr><td colSpan={10} className="px-4 py-12 text-center text-gray-400">Aucun dossier dans le pipeline des 30 derniers jours</td></tr>}
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
                  <p className="text-xs text-gray-400 mt-0.5">Cliquez sur un commercial pour voir le détail</p>
                </div>
                <div className="p-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="text-left text-xs font-semibold text-gray-400 pr-4 pb-2 min-w-[140px]">Commercial</th>
                        {data.months.map((m, i) => <th key={m} className="text-center text-xs text-gray-400 font-medium pb-2 px-0.5 whitespace-nowrap">{data.month_labels[i]}</th>)}
                        <th className="text-right text-xs font-semibold text-gray-400 pl-4 pb-2">Total</th>
                        <th className="text-right text-xs font-semibold text-gray-400 pl-3 pb-2">Délai moy.</th>
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
                          {data.months.map(m => { const d = com.monthly.find(r => r.month === m); return <td key={m} className="px-0.5 py-1.5"><HeatCell v={d?.signes || 0} max={heatMax} onClick={() => setSelCom(com)} /></td> })}
                          <td className="pl-4 py-1.5 text-right font-bold text-gray-800">{com.signes}</td>
                          <td className="pl-3 py-1.5 text-right text-xs text-gray-500">{com.delai_moy_creation_signature > 0 ? `${com.delai_moy_creation_signature}j` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-200">
                        <td className="pr-4 pt-2 pb-1 text-xs font-semibold text-gray-500">TOTAL</td>
                        {data.months.map(m => { const total = data.par_commercial.reduce((s, c) => s + (c.monthly.find(r => r.month === m)?.signes || 0), 0); return <td key={m} className="px-0.5 pt-2 pb-1 text-center"><span className="text-xs font-bold text-gray-600">{total || ''}</span></td> })}
                        <td className="pl-4 pt-2 pb-1 text-right font-bold text-blue-600">{data.meta.total_signes}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="px-5 pb-4 flex items-center gap-2 text-xs text-gray-400">
                  <span>Faible</span>
                  {['bg-gray-100','bg-amber-100','bg-amber-200','bg-amber-300','bg-amber-400','bg-amber-500'].map((c, i) => <div key={i} className={`w-5 h-4 rounded ${c}`} />)}
                  <span>Élevé</span>
                </div>
              </div>
            )}

            {/* ── INSTALLATEURS ── */}
            {view === 'installateurs' && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-4">
                  <div className="flex-1"><h2 className="font-semibold text-gray-900">Tous les installateurs</h2><p className="text-xs text-gray-400 mt-0.5">{filteredInstSorted.length} installateurs</p></div>
                  <input type="text" placeholder="Rechercher…" value={search} onChange={e => setSearch(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-56 focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-10">#</th>
                        <Th label="Installateur"  k="nom"                          col={instSort.col} dir={instSort.dir} onSort={instSort.toggle} />
                        <Th label="Signés"         k="signes"                       col={instSort.col} dir={instSort.dir} onSort={instSort.toggle} />
                        <Th label="Annulés"        k="annules"                      col={instSort.col} dir={instSort.dir} onSort={instSort.toggle} />
                        <Th label="Taux annul."    k="taux_annulation"              col={instSort.col} dir={instSort.dir} onSort={instSort.toggle} />
                        <Th label="CAPEX HT"       k="capex"                        col={instSort.col} dir={instSort.dir} onSort={instSort.toggle} />
                        <Th label="kWc"            k="kwc"                          col={instSort.col} dir={instSort.dir} onSort={instSort.toggle} />
                        <Th label="Poses"          k="poses"                        col={instSort.col} dir={instSort.dir} onSort={instSort.toggle} />
                        <Th label="Taux pose"      k="taux_pose"                    col={instSort.col} dir={instSort.dir} onSort={instSort.toggle} />
                        <Th label="Délai sig."     k="delai_moy_creation_signature" col={instSort.col} dir={instSort.dir} onSort={instSort.toggle} />
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Tendance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredInstSorted.map((inst, i) => (
                        <tr key={inst.nom} className="hover:bg-amber-50 transition-colors">
                          <td className="px-3 py-2.5 text-gray-400 text-xs">{i + 1}</td>
                          <td className="px-3 py-2.5 font-medium text-gray-800 truncate max-w-[200px]">{inst.nom}</td>
                          <td className="px-3 py-2.5"><PctBarCount v={inst.signes} max={maxInst} color="bg-amber-400" /></td>
                          <td className="px-3 py-2.5"><span className={`font-medium ${inst.annules > 0 ? 'text-red-500' : 'text-gray-300'}`}>{inst.annules}</span></td>
                          <td className="px-3 py-2.5"><span className={`text-sm font-medium ${inst.taux_annulation > 20 ? 'text-red-500' : inst.taux_annulation > 10 ? 'text-orange-500' : 'text-gray-400'}`}>{inst.taux_annulation}%</span></td>
                          <td className="px-3 py-2.5 font-medium text-gray-700">{fmtK(inst.capex)}</td>
                          <td className="px-3 py-2.5 text-gray-600">{inst.kwc.toFixed(1)}</td>
                          <td className="px-3 py-2.5 text-gray-700">{inst.poses}</td>
                          <td className="px-3 py-2.5"><TauxPose v={inst.taux_pose} /></td>
                          <td className="px-3 py-2.5 text-gray-500 text-sm">{inst.delai_moy_creation_signature > 0 ? `${inst.delai_moy_creation_signature}j` : '—'}</td>
                          <td className="px-3 py-2.5"><Sparkline data={data.months.map(m => inst.monthly.find(r => r.month === m)?.signes || 0)} color="#f59e0b" /></td>
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
