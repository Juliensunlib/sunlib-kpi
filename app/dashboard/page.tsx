import { fetchAllAbonnes, fetchSnapshots } from '@/lib/airtable'
import { computeKPIs, diffSnapshots, type KPIData, type ChangeEntry } from '@/lib/kpi-engine'
import DashboardClient from '@/components/DashboardClient'

// Force Vercel à recalculer à chaque requête — sans ça Next.js cache une page vide au build
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function DashboardPage() {
  let kpiData: KPIData | null = null
  let changelog: Array<{ date: string; entries: ChangeEntry[] }> = []
  let error: string | null = null

  try {
    const [records, snaps] = await Promise.all([
      fetchAllAbonnes(),
      fetchSnapshots(60),
    ])

    kpiData = computeKPIs(records)

    for (const s of snaps) {
      try {
        const entries: ChangeEntry[] = JSON.parse((s.fields.changes as string) || '[]')
        if (entries.length > 0) {
          changelog.push({ date: s.fields.snapshot_date as string, entries })
        }
      } catch { /* snapshot malformé */ }
    }

    if (snaps.length > 0 && snaps[0].fields.snapshot_data) {
      try {
        const prev = JSON.parse(snaps[0].fields.snapshot_data as string) as KPIData
        const todayChanges = diffSnapshots(prev, kpiData)
        const today = new Date().toISOString().substring(0, 10)
        if (todayChanges.length > 0 && changelog[0]?.date !== today) {
          changelog.unshift({ date: today, entries: todayChanges })
        }
      } catch { /* skip */ }
    }
  } catch (e) {
    error = String(e)
  }

  return <DashboardClient initialData={kpiData} changelog={changelog} error={error} />
}
