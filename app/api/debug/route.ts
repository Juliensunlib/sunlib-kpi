import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const base  = process.env.AIRTABLE_BASE_ID
  const table = process.env.AIRTABLE_ABONNES_TABLE
  const key   = process.env.AIRTABLE_API_KEY

  // Vérifier les variables d'environnement
  if (!base || !table || !key) {
    return NextResponse.json({
      error: 'Variables manquantes',
      base:  base  ? '✅ présent' : '❌ MANQUANT',
      table: table ? '✅ présent' : '❌ MANQUANT',
      key:   key   ? '✅ présent' : '❌ MANQUANT',
    })
  }

  // Tester l'API Airtable avec 3 records
  const url = `https://api.airtable.com/v0/${base}/${table}?pageSize=3&fields[]=fldcThGrSIaaAVbew&fields[]=fld3SpiGzcJrADLgL&fields[]=fldk94N7n4aQW482K&fields[]=fldFbme1enY3VGb40`

  try {
    const res  = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      cache: 'no-store',
    })
    const body = await res.json()

    return NextResponse.json({
      status:  res.status,
      ok:      res.ok,
      base, table,
      key_preview: key.substring(0, 15) + '...',
      sample:  body,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) })
  }
}
