interface ChangeEntry {
  metric: string; old_val: number | null; new_val: number
  delta: number; delta_pct: number | null; context?: string
}

interface Props {
  entries: Array<{ date: string; entries: ChangeEntry[] }>
  lastRead?: string
}

export default function Changelog({ entries, lastRead = '' }: Props) {
  if (!entries.length) return (
    <div className="p-8 text-center text-sm text-gray-400">
      <p className="text-3xl mb-2">📋</p>
      <p className="font-medium mb-1">Aucun changement enregistré</p>
      <p className="text-xs">Cliquez sur 📸 Snapshot pour créer un premier point de référence</p>
    </div>
  )

  return (
    <div className="divide-y divide-gray-100">
      {entries.map((day, i) => {
        const isUnread = day.date > lastRead
        return (
          <div key={i} className={`p-4 ${isUnread ? 'bg-amber-50' : ''}`}>
            <div className="flex items-center gap-2 mb-3">
              {isUnread && (
                <span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0" />
              )}
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {new Date(day.date).toLocaleDateString('fr-FR', {
                  day: 'numeric', month: 'long', year: 'numeric'
                })}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                isUnread
                  ? 'bg-red-100 text-red-700 font-semibold'
                  : 'bg-gray-100 text-gray-500'
              }`}>
                {day.entries.length} changement{day.entries.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="space-y-2">
              {day.entries.map((e, j) => {
                const sign = e.delta > 0 ? '+' : ''
                const cls  = e.delta > 0 ? 'text-emerald-600' : e.delta < 0 ? 'text-red-500' : 'text-gray-400'
                return (
                  <div key={j} className="bg-white rounded-lg p-3 shadow-sm">
                    <div className="flex justify-between items-start gap-2">
                      <p className="text-sm font-medium text-gray-800">{e.metric}</p>
                      {e.old_val !== null && (
                        <span className={`text-sm font-semibold ${cls} flex-shrink-0`}>
                          {sign}{Math.round(e.delta * 10) / 10}
                          {e.delta_pct !== null && (
                            <span className="text-xs ml-1 opacity-60">({sign}{e.delta_pct}%)</span>
                          )}
                        </span>
                      )}
                    </div>
                    {e.old_val !== null && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {e.old_val} → <span className="text-gray-700">{e.new_val}</span>
                      </p>
                    )}
                    {e.context && (
                      <div className="mt-2 border-t border-gray-100 pt-2">
                        {e.context.split('\n').map((line, k) => (
                          <p key={k} className="text-xs text-gray-600 leading-5">• {line}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
