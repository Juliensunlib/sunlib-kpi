import type { ChangeEntry } from '@/lib/kpi-engine'

interface Props {
  entries: Array<{ date: string; entries: ChangeEntry[] }>
}

function Delta({ delta, pct }: { delta: number; pct: number | null }) {
  const cls = delta > 0 ? 'delta-up' : delta < 0 ? 'delta-down' : 'delta-flat'
  const sign = delta > 0 ? '+' : ''
  return (
    <span className={`font-medium ${cls}`}>
      {sign}{Math.round(delta * 10) / 10}
      {pct !== null && <span className="text-xs ml-1 opacity-70">({sign}{pct}%)</span>}
    </span>
  )
}

export default function Changelog({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-gray-400">
        <p className="text-3xl mb-2">📋</p>
        <p>Aucun changement enregistré</p>
        <p className="text-xs mt-1">Cliquez sur "Snapshot" pour créer un point de référence</p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-gray-100">
      {entries.map((day, i) => (
        <div key={i} className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {new Date(day.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
            <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full">
              {day.entries.length} changement{day.entries.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-2">
            {day.entries.map((e, j) => (
              <div key={j} className="bg-gray-50 rounded-lg p-3">
                <div className="flex justify-between items-start gap-2">
                  <p className="text-sm font-medium text-gray-800">{e.metric}</p>
                  <Delta delta={e.delta} pct={e.delta_pct} />
                </div>
                {e.old_val !== null && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {e.old_val} → <span className="text-gray-700">{e.new_val}</span>
                  </p>
                )}
                {e.context && (
                  <p className="text-xs text-gray-500 mt-1 italic">{e.context}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
