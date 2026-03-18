import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Simple in-memory rate limiter (per-instance sliding window)
// Good enough for MVP without Redis. Limits apply per IP per method.
// ---------------------------------------------------------------------------
const rlMap = new Map<string, { count: number; resetAt: number }>()
const RL_WINDOW_MS = 60_000
const RL_LIMITS: Record<string, number> = {
  GET: 60,
  POST: 20,
  PATCH: 30,
  DELETE: 10,
}

function isRateLimited(ip: string, method: string): boolean {
  const limit = RL_LIMITS[method] ?? 30
  const now = Date.now()
  const key = `${ip}:${method}`
  const entry = rlMap.get(key)

  if (!entry || now > entry.resetAt) {
    rlMap.set(key, { count: 1, resetAt: now + RL_WINDOW_MS })
    return false
  }

  if (entry.count >= limit) return true
  entry.count++
  return false
}

function buildCsp(nonce: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${supabaseUrl}`,
    "font-src 'self'",
    `connect-src 'self' ${supabaseUrl} wss:`,
    `frame-src ${supabaseUrl}`,
    "frame-ancestors 'none'",
  ].join('; ')
}

export async function middleware(request: NextRequest) {
  try {
  return await middlewareInner(request)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message + '\n' + err.stack : String(err)
    return NextResponse.json({ error: 'MIDDLEWARE_DEBUG', detail: msg }, { status: 500 })
  }
}

async function middlewareInner(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Rate-limit sensitive API endpoints
  if (pathname.startsWith('/api/belege') || pathname.startsWith('/api/transaktionen') || pathname.startsWith('/api/matching') || pathname.startsWith('/api/monatsabschluss') || pathname.startsWith('/api/export')) {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
      request.headers.get('x-real-ip') ??
      'unknown'

    if (isRateLimited(ip, request.method)) {
      return NextResponse.json(
        { error: 'Zu viele Anfragen. Bitte warte einen Moment.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      )
    }
  }

  const nonce = btoa(crypto.randomUUID())
  const csp = buildCsp(nonce)

  // Inject nonce into request headers so Next.js applies it to its own inline scripts
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)

  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })
  supabaseResponse.headers.set('Content-Security-Policy', csp)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })
          supabaseResponse.headers.set('Content-Security-Policy', csp)
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isAuthRoute = pathname.startsWith('/login') ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/verify-email') ||
    pathname.startsWith('/auth/')

  const isOnboarding = pathname.startsWith('/onboarding')

  // 1. Unauthenticated → /login
  if (!user && !isAuthRoute && pathname !== '/') {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  // 2. Authenticated → weg von Auth-Seiten
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // 3+4. Onboarding-Check (single DB query covers both cases)
  if (user && !isAuthRoute && !pathname.startsWith('/api/') && pathname !== '/') {
    const { data: mandant } = await supabase
      .from('mandanten')
      .select('onboarding_abgeschlossen')
      .eq('owner_id', user.id)
      .maybeSingle()

    // Active invited members are not owners, so mandant is null for them.
    // Check mandant_users to avoid wrongly sending them to /onboarding.
    const isActiveMember = !mandant
      ? await supabase
          .from('mandant_users')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('aktiv', true)
          .then(({ count }) => (count ?? 0) > 0)
      : false

    if (isOnboarding) {
      // Already completed (or invited member) → redirect away from wizard
      if (mandant?.onboarding_abgeschlossen || isActiveMember) {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard'
        return NextResponse.redirect(url)
      }
    } else {
      // Not yet completed → redirect to wizard (skip for invited members)
      if (!isActiveMember && (!mandant || !mandant.onboarding_abgeschlossen)) {
        const url = request.nextUrl.clone()
        url.pathname = '/onboarding'
        return NextResponse.redirect(url)
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
