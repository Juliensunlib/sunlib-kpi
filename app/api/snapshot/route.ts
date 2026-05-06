import { NextResponse } from 'next/server'
import { fetchAllAbonnes, fetchSnapshots, createSnapshot } from '@/lib/airtable'
import { computeKPIs, diffSnapshots, type KPIData, type ChangeEntry } from '@/lib/kpi-engine'

export async function GET() {
  try {
    const snaps = await fetchSnapshots(30)
    const changelog: Array<{ date: string; entries: ChangeEntry[] }> = []

    for (const s of snaps) {
      const changesRaw = s.fields.changes as string
      if (changesRaw) {
        try {
          const entries = JSON.parse(changesRaw)
          if (entries.length > 0) {
            changelog.push({ date: s.fields.snapshot_date as string, entries })
          }
        } catch {}
      }
    }

    return NextResponse.json({ changelog, count: snaps.length })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST() {
  try {
    const [records, snaps] = await Promise.all([fetchAllAbonnes(), fetchSnapshots(1)])
    const current = computeKPIs(records)

    let changes: ChangeEntry[] = []
    if (snaps.length > 0) {
      try {
        const prevData = JSON.parse(snaps[0].fields.snapshot_data as string) as KPIData
        changes = diffSnapshots(prevData, current)
      } catch {}
    }

    await createSnapshot({
      snapshot_date: new Date().toISOString().substring(0, 10),
      snapshot_data: JSON.stringify(current),
      changes: JSON.stringify(changes),
      triggered_by: 'api',
    })

    return NextResponse.json({ ok: true, changes_detected: changes.length })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
