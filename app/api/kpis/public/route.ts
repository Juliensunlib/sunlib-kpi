import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (token !== process.env.PUBLIC_API_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // Redirige vers la vraie route /api/kpis avec les mêmes params
  const params = new URLSearchParams(req.nextUrl.searchParams)
  params.delete('token')
  const res = await fetch(`${req.nextUrl.origin}/api/kpis?${params}`, {
    headers: { cookie: `kpi_token=bypass` },
  })
  return res
}
