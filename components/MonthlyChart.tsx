'use client'
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import type { MonthlyRow } from '@/lib/kpi-engine'

type Metric = 'signes' | 'poses' | 'capex' | 'kwc' | 'duree_f2'

interface Props { data: MonthlyRow[]; metric: Metric; showSegments: boolean }

const PC = '#378ADD', SC = '#D4537E', GC = '#f59e0b'

const fmtEur = (v: number) => new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 0 }).format(v) + ' €'
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
          <Bar dataKey="nb_poses_pro"  name="Poses Pro"   stackId="p" fill={PC} />
          <Bar dataKey="nb_poses_part" name="Poses Part."  stackId="p" fill={SC} radius={[3,3,0,0]} />
        </>
      ) : <Bar dataKey="nb_poses" name="Poses (F2)" fill={GC} radius={[3,3,0,0]} />,
    },
    capex: {
      yFmt: fmtEur,
      bars: <Bar dataKey="capex_ht" name="CAPEX HT" fill={GC} radius={[3,3,0,0]} />,
    },
    kwc: {
      yFmt: fmtKwc,
      bars: (
        <>
          <Bar dataKey="kwc_signes" name="kWc signés" fill={PC} radius={[3,3,0,0]} />
          <Bar dataKey="kwc_poses"  name="kWc posés"  fill={SC} radius={[3,3,0,0]} />
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
      <ComposedChart data={chartData} margin={{ top: 4, right: 20, left: 10, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={yFmt} tick={{ fontSize: 11, fill: '#888' }} axisLine={false} tickLine={false} width={62} />
        <Tooltip
          formatter={(v: number, n: string) => [yFmt(v), n]}
          labelStyle={{ fontWeight: 500, fontSize: 12 }}
          contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
        />
        <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
        {bars}
        {metric === 'signes' && (
          <Line type="monotone" dataKey="nb_signes" stroke="#94a3b8"
            strokeWidth={1.5} dot={false} strokeDasharray="4 3" legendType="none" />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
