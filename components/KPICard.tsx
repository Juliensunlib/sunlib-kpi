interface Props {
  label: string
  value: number
  unit?: string
  icon?: string
  sub?: string
  decimals?: number
  format?: 'number' | 'currency'
}

export default function KPICard({ label, value, unit = '', icon, sub, decimals = 0, format = 'number' }: Props) {
  const display = format === 'currency'
    ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)
    : `${value.toFixed(decimals)}${unit}`

  return (
    <div className="kpi-card">
      <div className="flex items-start justify-between mb-1">
        <p className="kpi-label">{label}</p>
        {icon && <span className="text-base">{icon}</span>}
      </div>
      <p className="kpi-value">{display}</p>
      {sub && <p className="kpi-sub">{sub}</p>}
    </div>
  )
}
