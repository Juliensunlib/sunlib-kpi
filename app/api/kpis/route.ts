import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const base  = process.env.AIRTABLE_BASE_ID
  const table = process.env.AIRTABLE_ABONNES_TABLE
  const key   = process.env.AIRTABLE_API_KEY

  if (!base || !table || !key) {
    return NextResponse.json({
      erreur: 'Variables manquantes',
      BASE:  base  ? '✅' : '❌ MANQUANT',
      TABLE: table ? '✅' : '❌ MANQUANT',
      KEY:   key   ? '✅' : '❌ MANQUANT',
    })
  }

  // Fetch seulement 3 records pour voir leur structure exacte
  const url = `https://api.airtable.com/v0/${base}/${table}?pageSize=3&fields[]=fldcThGrSIaaAVbew&fields[]=fldk94N7n4aQW482K&fields[]=fld3SpiGzcJrADLgL`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}` },
    cache: 'no-store',
  })
  const body = await res.json()

  return NextResponse.json({
    http_status: res.status,
    base, table,
    key_debut: key.substring(0, 20) + '...',
    reponse_airtable: body,
  })
}
