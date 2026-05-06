'use client'
import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import type { MonthlyRow } from '@/lib/kpi-engine'

type Metric = 'signes' | 'poses' | 'capex_signes' | 'capex_poses' | 'kwc' | 'duree_f2'

interface Props { data: MonthlyRow[]; metric: Metric; showSegments: boolean }

const PC = '#378ADD', SC = '#D4537E', GC = '#f59e0b', GC2 = '#10b981'

// Formatage exact — pas de notation compacte
const fmtEur = (v: number) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v)

const fmtJ   = (v: number) => `${v} j`
const fmtKwc = (v: number) => `${v} kWc`

export default function MonthlyChart({ data, metric, showSegments }: Props) {
  const chartData = data.map(d => ({ ...d, name: d.label }))

  const configs: Record<Metric, { yFmt: (v: number) => string; bars: React.ReactNode }> = {
    signes: {
      yFmt: String,
      bars: showSegments ? (
        <>
          <Bar dataKey="nb_signes_pro"  name="Pro"      stackId="s" fill={PC} />
          <Bar dataKey="nb_signes_part" name="Solo+Duo" stackId="s" fill={SC} radius={[3,3,0,0]} />
        </>
      ) : <Bar dataKey="nb_signes" name="Contrats signés" fill={GC} radius={[3,3,0,0]} />,
    },
    poses: {
      yFmt: String,
      bars: showSegments ? (
        <>
          <Bar dataKey="nb_poses_pro"  name="Poses Pro"  stackId="p" fill={PC} />
          <Bar dataKey="nb_poses_part" name="Poses Part." stackId="p" fill={SC} radius={[3,3,0,0]} />
        </>
      ) : <Bar dataKey="nb_poses" name="Poses (F2)" fill={GC2} radius={[3,3,0,0]} />,
    },
    capex_signes: {
      yFmt: fmtEur,
      bars: <Bar dataKey="capex_ht_signes" name="CAPEX signé (€ HT)" fill={GC} radius={[3,3,0,0]} />,
    },
    capex_poses: {
      yFmt: fmtEur,
      bars: <Bar dataKey="capex_ht_poses" name="CAPEX posé (€ HT)" fill={GC2} radius={[3,3,0,0]} />,
    },
    kwc: {
      yFmt: fmtKwc,
      bars: (
        <>
          <Bar dataKey="kwc_signes" name="kWc signés" fill={PC} radius={[3,3,0,0]} />
          <Bar dataKey="kwc_poses"  name="kWc posés"  fill={GC2} radius={[3,3,0,0]} />
        </>
      ),
    },
    duree_f2: {
      yFmt: fmtJ,
      bars: <Bar dataKey="moy_duree_f2" name="Durée moy. F2 (j)" fill={GC} radius={[3,3,0,0]} />,
    },
  }

  const { yFmt, bars } = configs[metric]

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={chartData} margin={{ top: 4, right: 20, left: 20, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
        <YAxis
          tickFormatter={yFmt}
          tick={{ fontSize: 10, fill: '#888' }}
          axisLine={false}
          tickLine={false}
          width={metric.startsWith('capex') ? 120 : 70}
        />
        <Tooltip
          formatter={(v: number, n: string) => [fmtEur ? yFmt(v) : v, n]}
          labelStyle={{ fontWeight: 500, fontSize: 12 }}
          contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
        />
        <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
        {bars}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
