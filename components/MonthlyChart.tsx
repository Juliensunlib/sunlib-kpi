'use client'
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'

type Metric = 'signes' | 'poses' | 'capex_signes' | 'capex_poses' | 'kwc' | 'duree_f2'

interface MonthlyRow {
  month: string; label: string
  nb_signes: number; nb_signes_pro: number; nb_signes_part: number
  kwc_signes: number; capex_ht_signes: number
  moy_abonnement: number; moy_duree_contrat: number
  nb_poses: number; nb_poses_pro: number; nb_poses_part: number
  kwc_poses: number; capex_ht_poses: number; moy_duree_f2: number
  nb_f3: number
}

interface Props { data: MonthlyRow[]; metric: Metric; showSegments: boolean }

const PC = '#378ADD', SC = '#D4537E', GC = '#f59e0b', GR = '#10b981'

// Formatage précis — jamais de notation compacte
const fmtEur = (v: number) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v)

const fmtJ   = (v: number) => `${Math.round(v)} j`
const fmtKwc = (v: number) => `${v} kWc`
const fmtN   = (v: number) => String(v)

export default function MonthlyChart({ data, metric, showSegments }: Props) {
  const chartData = data.map(d => ({ ...d, name: d.label }))

  type Config = { yFmt: (v: number) => string; bars: React.ReactNode; width: number }

  const configs: Record<Metric, Config> = {
    signes: {
      yFmt: fmtN, width: 50,
      bars: showSegments ? (
        <>
          <Bar dataKey="nb_signes_pro"  name="Pro"      stackId="s" fill={PC} />
          <Bar dataKey="nb_signes_part" name="Solo+Duo" stackId="s" fill={SC} radius={[3,3,0,0]} />
        </>
      ) : <Bar dataKey="nb_signes" name="Contrats signés" fill={GC} radius={[3,3,0,0]} />,
    },
    poses: {
      yFmt: fmtN, width: 50,
      bars: showSegments ? (
        <>
          <Bar dataKey="nb_poses_pro"  name="Poses Pro"  stackId="p" fill={PC} />
          <Bar dataKey="nb_poses_part" name="Poses Part." stackId="p" fill={SC} radius={[3,3,0,0]} />
        </>
      ) : <Bar dataKey="nb_poses" name="Poses (F2)" fill={GR} radius={[3,3,0,0]} />,
    },
    capex_signes: {
      yFmt: fmtEur, width: 160,
      bars: <Bar dataKey="capex_ht_signes" name="CAPEX signé (€ HT)" fill={GC} radius={[3,3,0,0]} />,
    },
    capex_poses: {
      yFmt: fmtEur, width: 160,
      bars: <Bar dataKey="capex_ht_poses" name="CAPEX posé (€ HT)" fill={GR} radius={[3,3,0,0]} />,
    },
    kwc: {
      yFmt: fmtKwc, width: 80,
      bars: (
        <>
          <Bar dataKey="kwc_signes" name="kWc signés" fill={PC} radius={[3,3,0,0]} />
          <Bar dataKey="kwc_poses"  name="kWc posés"  fill={GR} radius={[3,3,0,0]} />
        </>
      ),
    },
    duree_f2: {
      yFmt: fmtJ, width: 60,
      bars: <Bar dataKey="moy_duree_f2" name="Durée moy. F2 (j)" fill={GC} radius={[3,3,0,0]} />,
    },
  }

  const { yFmt, bars, width } = configs[metric]

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={chartData} margin={{ top: 4, right: 10, left: 10, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: '#888' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={yFmt}
          tick={{ fontSize: 10, fill: '#888' }}
          axisLine={false}
          tickLine={false}
          width={width}
        />
        <Tooltip
          formatter={(v: number, n: string) => [yFmt(v), n]}
          labelStyle={{ fontWeight: 500, fontSize: 12 }}
          contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
        />
        <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
        {bars}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
