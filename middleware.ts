import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

const secret = new TextEncoder().encode(process.env.JWT_SECRET!)

const PUBLIC_PATHS = ['/login', '/api/auth', '/api/snapshot', '/api/sellsy']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Routes publiques
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const token = req.cookies.get('kpi_token')?.value

  // Pas de token → login
  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  try {
    const { payload } = await jwtVerify(token, secret)
    const role = payload.role as string

    // Rôle commercial → accès à /commercial et /api/commercial uniquement
    if (role === 'commercial') {
      if (pathname.startsWith('/dashboard') || pathname.startsWith('/api/kpis') || pathname.startsWith('/api/snapshot')) {
        return NextResponse.redirect(new URL('/commercial', req.url))
      }
    }

    return NextResponse.next()
  } catch {
    return NextResponse.redirect(new URL('/login', req.url))
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
