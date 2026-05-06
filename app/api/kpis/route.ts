import { NextRequest, NextResponse } from 'next/server'
import { fetchAllAbonnes } from '@/lib/airtable'
import { computeKPIs, type Segment, type TypeInstall } from '@/lib/kpi-engine'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const segment = (searchParams.get('segment') || 'Tous') as Segment
    const typeInstall = (searchParams.get('typeInstall') || 'Tous') as TypeInstall
    const annee = searchParams.get('annee') ? Number(searchParams.get('annee')) : undefined

    const records = await fetchAllAbonnes()
    const kpis = computeKPIs(records, { segment, typeInstall, annee })

    return NextResponse.json(kpis, {
      headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' }
    })
  } catch (e) {
    console.error('KPI error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
