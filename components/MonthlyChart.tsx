'use client'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell
} from 'recharts'

type TabId = 'signes' | 'poses' | 'capex_signes' | 'capex_poses' | 'kwc' | 'duree_f2'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MonthRow = Record<string, any>

const PRO_COLOR  = '#3b82f6'  // bleu
const PART_COLOR = '#f59e0b'  // amber
const TOT_COLOR  = '#6366f1'  // indigo (quand filtre actif)

const fmtEur = (v: number) =>
  v >= 1_000_000
    ? `${(v / 1_000_000).toFixed(2)} M€`
    : v >= 1_000
      ? `${Math.round(v / 1_000)}k€`
      : `${Math.round(v)}€`

// Tooltip personnalisé
function CustomTooltip({ active, payload, label, metric }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  active?: boolean; payload?: any[]; label?: string; metric: TabId
}) {
  if (!active || !payload?.length) return null
  const isEur = metric === 'capex_signes' || metric === 'capex_poses'
  const isKwc = metric === 'kwc'
  const isF2  = metric === 'duree_f2'

  const fmt = (v: number) =>
    isEur ? fmtEur(v) : isKwc ? `${v.toFixed(1)} kWc` : isF2 ? `${v.toFixed(0)} j` : String(v)

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-700 mb-1.5">{label}</p>
      {[...payload].reverse().map((p, i) => (
        <div key={i} className="flex items-center gap-2 mb-0.5">
          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: p.fill || p.color }} />
          <span className="text-gray-600">{p.name} :</span>
          <span className="font-semibold text-gray-800">{fmt(p.value)}</span>
        </div>
      ))}
      {payload.length > 1 && (
        <div className="flex items-center gap-2 mt-1 pt-1 border-t border-gray-100">
          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0 bg-gray-300" />
          <span className="text-gray-500">Total :</span>
          <span className="font-semibold text-gray-700">
            {fmt(payload.reduce((s, p) => s + (p.value || 0), 0))}
          </span>
        </div>
      )}
    </div>
  )
}

interface Props {
  data: MonthRow[]
  metric: TabId
  showSegments: boolean
}

// Mapping métrique → champs de données
const METRIC_CONFIG: Record<TabId, {
  proKey: string; partKey: string; totalKey: string
  label: string; stacked: boolean
}> = {
  signes: {
    proKey: 'nb_signes_pro', partKey: 'nb_signes_part', totalKey: 'nb_signes',
    label: 'Contrats signés', stacked: true,
  },
  poses: {
    proKey: 'nb_poses_pro', partKey: 'nb_poses_part', totalKey: 'nb_poses',
    label: 'Poses réalisées', stacked: true,
  },
  capex_signes: {
    proKey: 'capex_ht_signes_pro', partKey: 'capex_ht_signes_part', totalKey: 'capex_ht_signes',
    label: 'CAPEX signé HT', stacked: true,
  },
  capex_poses: {
    proKey: 'capex_ht_poses_pro', partKey: 'capex_ht_poses_part', totalKey: 'capex_ht_poses',
    label: 'CAPEX posé HT', stacked: true,
  },
  kwc: {
    proKey: 'kwc_signes_pro', partKey: 'kwc_signes_part', totalKey: 'kwc_signes',
    label: 'kWc signés', stacked: true,
  },
  duree_f2: {
    proKey: 'moy_duree_f2_pro', partKey: 'moy_duree_f2_part', totalKey: 'moy_duree_f2',
    label: 'Durée moy. F2 (j)', stacked: false,  // barres côte à côte pour les moyennes
  },
}

// Formateur axe Y
function yFormatter(metric: TabId) {
  if (metric === 'capex_signes' || metric === 'capex_poses') return (v: number) => fmtEur(v)
  if (metric === 'kwc') return (v: number) => `${v.toFixed(0)}`
  if (metric === 'duree_f2') return (v: number) => `${v}j`
  return (v: number) => String(v)
}

export default function MonthlyChart({ data, metric, showSegments }: Props) {
  if (!data.length) return <p className="text-center text-gray-400 py-16">Aucune donnée</p>

  const cfg = METRIC_CONFIG[metric]
  const isStacked = cfg.stacked && showSegments

  // Calculer le total pour les barres "total" (quand filtre actif et pas de segmentation)
  const chartData = data.map(d => ({
    ...d,
    label: d.label,
    // Pour duree_f2, on utilise directement les valeurs (moyennes)
    _pro:   d[cfg.proKey]   || 0,
    _part:  d[cfg.partKey]  || 0,
    _total: d[cfg.totalKey] || 0,
  }))

  const yFmt = yFormatter(metric)

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart
          data={chartData}
          margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
          barCategoryGap="25%"
          barGap={2}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={yFmt}
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            axisLine={false}
            tickLine={false}
            width={metric === 'capex_signes' || metric === 'capex_poses' ? 60 : 40}
          />
          <Tooltip content={<CustomTooltip metric={metric} />} cursor={{ fill: '#f8fafc' }} />
          {showSegments && (
            <Legend
              formatter={(value) => (
                <span className="text-xs text-gray-600">{value}</span>
              )}
            />
          )}

          {showSegments ? (
            // Mode segmenté : Pro + Particulier
            <>
              <Bar
                dataKey="_pro"
                name="Pro"
                fill={PRO_COLOR}
                stackId={isStacked ? 'stack' : undefined}
                radius={isStacked ? [0, 0, 0, 0] : [3, 3, 0, 0]}
                maxBarSize={40}
              />
              <Bar
                dataKey="_part"
                name="Particulier"
                fill={PART_COLOR}
                stackId={isStacked ? 'stack' : undefined}
                radius={isStacked ? [3, 3, 0, 0] : [3, 3, 0, 0]}
                maxBarSize={40}
              />
            </>
          ) : (
            // Mode total : une seule barre
            <Bar
              dataKey="_total"
              name={cfg.label}
              fill={TOT_COLOR}
              radius={[3, 3, 0, 0]}
              maxBarSize={40}
            >
              {chartData.map((_, i) => (
                <Cell key={i} fill={TOT_COLOR} opacity={0.85 + (i % 2) * 0.15} />
              ))}
            </Bar>
          )}
        </BarChart>
      </ResponsiveContainer>

      {/* Légende manuelle Pro/Part si segmenté */}
      {showSegments && (
        <div className="flex items-center justify-center gap-6 mt-1 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ background: PRO_COLOR }} />
            Pro
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ background: PART_COLOR }} />
            Particulier
          </span>
        </div>
      )}
    </div>
  )
}
