import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const filePath = join(process.cwd(), 'data', 'objectifs.json')
    const raw  = readFileSync(filePath, 'utf-8')
    const data = JSON.parse(raw) as Record<string, Record<string, Record<string, number>>>
    return NextResponse.json({ objectifs: data })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
