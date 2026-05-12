import { NextResponse } from 'next/server'
import { SignJWT, jwtVerify } from 'jose'

const secret = new TextEncoder().encode(process.env.JWT_SECRET!)

export async function POST(req: Request) {
  const { password } = await req.json()

  let role: 'admin' | 'commercial' | null = null

  if (password === process.env.KPI_PASSWORD) {
    role = 'admin'
  } else if (password === process.env.COMMERCIAL_PASSWORD) {
    role = 'commercial'
  }

  if (!role) {
    return NextResponse.json({ error: 'Mot de passe incorrect' }, { status: 401 })
  }

  const token = await new SignJWT({ role })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(secret)

  const res = NextResponse.json({ ok: true, role })
  res.cookies.set('kpi_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set('kpi_token', '', { maxAge: 0, path: '/' })
  return res
}

export async function GET(req: Request) {
  const cookie = req.headers.get('cookie') || ''
  const token  = cookie.split(';').find(c => c.trim().startsWith('kpi_token='))?.split('=')?.[1]
  if (!token) return NextResponse.json({ ok: false })
  try {
    const { payload } = await jwtVerify(token, secret)
    return NextResponse.json({ ok: true, role: payload.role })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
