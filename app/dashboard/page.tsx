import { fetchAllAbonnes } from '@/lib/airtable'
import { computeKPIs } from '@/lib/kpi-engine'
import { fetchSnapshots } from '@/lib/airtable'
import { diffSnapshots, type ChangeEntry, type KPIData } from '@/lib/kpi-engine'
import DashboardClient from '@/components/DashboardClient'

export const revalidate = 300 // Re-fetch every 5 min

export default async function DashboardPage() {
  let kpiData = null
  let changelog: Array<{ date: string; entries: ChangeEntry[] }> = []
  let error: string | null = null

  try {
    const [records, snaps] = await Promise.all([
      fetchAllAbonnes(),
      fetchSnapshots(60),
    ])

    kpiData = computeKPIs(records)

    // Construire le changelog depuis les snapshots
    for (const s of snaps) {
      try {
        const entries: ChangeEntry[] = JSON.parse(s.fields.changes as string || '[]')
        if (entries.length > 0) {
          changelog.push({ date: s.fields.snapshot_date as string, entries })
        }
      } catch {}
    }

    // Si on a un snapshot précédent, calculer les changements depuis
    if (snaps.length > 0) {
      try {
        const prevData = JSON.parse(snaps[0].fields.snapshot_data as string) as KPIData
        const todayChanges = diffSnapshots(prevData, kpiData)
        if (todayChanges.length > 0 && changelog[0]?.date !== new Date().toISOString().substring(0, 10)) {
          changelog.unshift({
            date: new Date().toISOString().substring(0, 10),
            entries: todayChanges
          })
        }
      } catch {}
    }
  } catch (e) {
    error = String(e)
  }

  return <DashboardClient initialData={kpiData} changelog={changelog} error={error} />
}
