import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const filePath = join(process.cwd(), 'data', 'objectifs.json')
    const raw = readFileSync(filePath, 'utf-8')
    const data = JSON.parse(raw) as Record<string, Record<string, Record<string, number>>>

    const annee = new Date().getFullYear().toString()
    const objAnnee = data[annee] || data[Object.keys(data)[0]] || {}

    // Transforme en { "Julien Ramon": { "2026-01": 184356, ... } }
    const objectifs: Record<string, Record<string, number>> = {}
    for (const [nom, mois] of Object.entries(objAnnee)) {
      objectifs[nom] = {}
      for (const [mm, val] of Object.entries(mois)) {
        objectifs[nom][`${annee}-${mm}`] = val
      }
    }

    return NextResponse.json({ objectifs })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
