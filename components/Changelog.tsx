import { IconClipboardList } from './icons'

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
    <div className="p-8 text-center text-sm text-muted">
      <IconClipboardList size={28} className="mx-auto mb-2 text-muted" />
      <p className="font-medium mb-1 text-ink">Aucun changement enregistré</p>
      <p className="text-xs">Cliquez sur Snapshot pour créer un premier point de référence</p>
    </div>
  )

  return (
    <div className="divide-y divide-line">
      {entries.map((day, i) => {
        const isUnread = day.date > lastRead
        return (
          <div key={i} className={`p-4 ${isUnread ? 'bg-teal-soft' : ''}`} style={isUnread ? { background: 'var(--teal-soft)' } : undefined}>
            <div className="flex items-center gap-2 mb-3">
              {isUnread && (
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--teal)' }} />
              )}
              <span className="text-xs font-semibold text-muted uppercase tracking-wide">
                {new Date(day.date).toLocaleDateString('fr-FR', {
                  day: 'numeric', month: 'long', year: 'numeric'
                })}
              </span>
              <span className={`badge ${isUnread ? 'badge-teal' : 'badge-gray'}`}>
                {day.entries.length} changement{day.entries.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="space-y-2">
              {day.entries.map((e, j) => {
                const sign = e.delta > 0 ? '+' : ''
                const style = e.delta > 0
                  ? { color: 'var(--green)' }
                  : e.delta < 0
                    ? { color: 'var(--red)' }
                    : { color: 'var(--muted)' }
                return (
                  <div key={j} className="bg-surface rounded-control p-3 shadow-sm border border-line">
                    <div className="flex justify-between items-start gap-2">
                      <p className="text-sm font-medium text-ink">{e.metric}</p>
                      {e.old_val !== null && (
                        <span className="text-sm font-semibold flex-shrink-0" style={style}>
                          {sign}{Math.round(e.delta * 10) / 10}
                          {e.delta_pct !== null && (
                            <span className="text-xs ml-1 opacity-60">({sign}{e.delta_pct}%)</span>
                          )}
                        </span>
                      )}
                    </div>
                    {e.old_val !== null && (
                      <p className="text-xs text-muted mt-0.5">
                        {e.old_val} → <span className="text-ink">{e.new_val}</span>
                      </p>
                    )}
                    {e.context && (
                      <div className="mt-2 border-t border-line pt-2">
                        {e.context.split('\n').map((line, k) => (
                          <p key={k} className="text-xs text-muted leading-5">• {line}</p>
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
