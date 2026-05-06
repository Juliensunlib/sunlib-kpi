'use client'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer
} from 'recharts'
import type { MonthlyRow, Segment } from '@/lib/kpi-engine'

interface Props {
  data: MonthlyRow[]
  metric: 'signes' | 'poses' | 'capex' | 'kwc' | 'duree'
  segment: Segment
}

const COLORS = { total: '#e67e22', pro: '#1a5276', part: '#2e86c1', global: '#aaa' }

const formatEur = (v: number) => `${new Intl.NumberFormat('fr-FR', { notation: 'compact' }).format(v)} €`
const formatKwc = (v: number) => `${v} kWc`
const formatJ = (v: number) => `${v} j`

export default function MonthlyChart({ data, metric, segment }: Props) {
  const showSegments = segment === 'Tous'

  let bars: React.ReactNode
  let yFormatter: (v: number) => string = String

  switch (metric) {
    case 'signes':
      yFormatter = v => String(v)
      bars = showSegments ? (
        <>
          <Bar dataKey="nb_signes_pro" name="Pro" stackId="s" fill={COLORS.pro} radius={[0,0,0,0]} />
          <Bar dataKey="nb_signes_part" name="Solo+Duo" stackId="s" fill={COLORS.part} radius={[3,3,0,0]} />
        </>
      ) : <Bar dataKey="nb_signes_total" name="Contrats signés" fill={COLORS.total} radius={[3,3,0,0]} />
      break

    case 'poses':
      yFormatter = v => String(v)
      bars = showSegments ? (
        <>
          <Bar dataKey="nb_poses_pro" name="Posés Pro" stackId="p" fill={COLORS.pro} />
          <Bar dataKey="nb_poses_part" name="Posés Part." stackId="p" fill={COLORS.part} radius={[3,3,0,0]} />
        </>
      ) : <Bar dataKey="nb_poses" name="Poses (F2)" fill={COLORS.total} radius={[3,3,0,0]} />
      break

    case 'capex':
      yFormatter = formatEur
      bars = <Bar dataKey="capex_ht" name="CAPEX HT" fill={COLORS.total} radius={[3,3,0,0]} />
      break

    case 'kwc':
      yFormatter = formatKwc
      bars = (
        <>
          <Bar dataKey="kwc_signes" name="kWc signés" fill={COLORS.pro} radius={[3,3,0,0]} />
          <Bar dataKey="kwc_poses" name="kWc posés" fill={COLORS.part} radius={[3,3,0,0]} />
        </>
      )
      break

    case 'duree':
      yFormatter = formatJ
      bars = <Bar dataKey="moy_duree_f2" name="Durée moy. F2 (j)" fill={COLORS.total} radius={[3,3,0,0]} />
      break
  }

  const chartData = data.map(d => ({ ...d, name: d.label }))

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: '#888' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={yFormatter}
          tick={{ fontSize: 11, fill: '#888' }}
          axisLine={false}
          tickLine={false}
          width={60}
        />
        <Tooltip
          formatter={(value: number, name: string) => [yFormatter(value), name]}
          labelStyle={{ fontWeight: 500, fontSize: 12 }}
          contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
        />
        <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
        {bars}
        {/* Ligne tendance */}
        {metric === 'signes' && (
          <Line
            type="monotone"
            dataKey="nb_signes_total"
            name="Tendance"
            stroke="#e67e22"
            strokeWidth={1.5}
            dot={false}
            strokeDasharray="4 3"
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
