import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const BASE   = process.env.AIRTABLE_BASE_ID!
const TABLE  = process.env.AIRTABLE_SELLSY_CACHE_TABLE!
const AT_KEY = process.env.AIRTABLE_API_KEY!

export async function GET() {
  try {
    // Lire le dernier enregistrement du cache
    const url = `https://api.airtable.com/v0/${BASE}/${TABLE}?sort[0][field]=cache_date&sort[0][direction]=desc&pageSize=1`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${AT_KEY}` },
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`Airtable read error: ${await res.text()}`)

    const d = await res.json() as {
      records: Array<{ fields: { cache_data: string; cache_date: string } }>
    }

    if (!d.records.length) {
      return NextResponse.json({ error: 'Cache vide — lancez /api/sellsy/refresh' }, { status: 404 })
    }

    const raw = d.records[0].fields.cache_data
    const data = JSON.parse(raw)

    return NextResponse.json({
      ...data,
      cache_date: d.records[0].fields.cache_date,
    })
  } catch (e) {
    console.error('[Sellsy GET]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
