import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Route Configuration
// ---------------------------------------------------------------------------

const PUBLIC_ROUTES = new Set([
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
])

// Webhook endpoints authenticated by provider signatures (not user sessions)
const WEBHOOK_ROUTES = new Set([
  '/api/billing/webhook',
  '/api/email-inbound',
])

// Auth endpoints subject to rate limiting
const RATE_LIMITED_ROUTES = [
  '/api/auth',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  // PROJ-9: Export endpoints are expensive (ZIP-Generierung + Storage-Downloads)
  '/api/export',
  // PROJ-31: Referral endpoints – öffentlich, daher rate-limited gegen Flooding/Brute-Force
  '/api/referral/track-click',
  '/api/referral/register',
  '/ref/',
]

// ---------------------------------------------------------------------------
// In-Memory Rate Limiter
// NOTE: This is instance-local. On Vercel (serverless), each cold start gets
// its own instance. For multi-instance rate limiting, replace with
// @upstash/ratelimit + Redis. This still provides meaningful protection
// within a single warm instance (e.g. dev, single-region hot paths).
// ---------------------------------------------------------------------------

interface RateLimitEntry {
  count: number
  windowStart: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()

const RATE_LIMIT_WINDOW_MS = 60_000 // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 20  // per IP per minute on sensitive routes

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitStore.get(ip)

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(ip, { count: 1, windowStart: now })
    // Prune old entries to prevent unbounded memory growth
    if (rateLimitStore.size > 10_000) {
      for (const [key, val] of rateLimitStore) {
        if (now - val.windowStart > RATE_LIMIT_WINDOW_MS) {
          rateLimitStore.delete(key)
        }
      }
    }
    return false
  }

  entry.count++
  if (entry.count > RATE_LIMIT_MAX_REQUESTS) return true
  return false
}

// ---------------------------------------------------------------------------
// CSP Builder
// ---------------------------------------------------------------------------

function buildCsp(nonce: string): string {
  const directives = [
    `default-src 'self'`,
    // Scripts: nonce-gated + Stripe (for billing iframes)
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com`,
    // Styles: self + inline (shadcn/ui injects inline styles via Radix)
    `style-src 'self' 'unsafe-inline'`,
    // Images: self + blob (file previews) + Supabase storage
    `img-src 'self' blob: data: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`,
    // Fonts: self
    `font-src 'self'`,
    // Frames: Stripe only
    `frame-src https://js.stripe.com https://hooks.stripe.com`,
    // Connect: self + Supabase + Stripe API
    `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL} https://api.stripe.com wss://*.supabase.co`,
    // Object, base, form
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    // Upgrade HTTP to HTTPS
    `upgrade-insecure-requests`,
  ]
  return directives.join('; ')
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip static assets and Next.js internals
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname.match(/\.(ico|png|jpg|jpeg|svg|webp|woff2?|ttf|eot)$/)
  ) {
    return NextResponse.next()
  }

  // Webhook routes bypass auth but still get security headers
  if (WEBHOOK_ROUTES.has(pathname)) {
    return NextResponse.next()
  }

  // Rate limiting for auth-sensitive routes
  const isRateLimitedRoute = RATE_LIMITED_ROUTES.some(r => pathname.startsWith(r))
  if (isRateLimitedRoute) {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown'

    if (isRateLimited(ip)) {
      return new NextResponse('Too Many Requests', {
        status: 429,
        headers: {
          'Retry-After': '60',
          'Content-Type': 'text/plain',
        },
      })
    }
  }

  // Generate CSP nonce for this request (Web Crypto API – works in Edge runtime)
  const nonceBytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(nonceBytes)
  const nonce = btoa(String.fromCharCode(...nonceBytes))
  const csp = buildCsp(nonce)

  // Create a response to mutate headers
  let response = NextResponse.next({
    request: {
      headers: new Headers(request.headers),
    },
  })

  // Pass nonce to page via header (read in layout via headers())
  response.headers.set('x-nonce', nonce)
  response.headers.set('Content-Security-Policy', csp)

  // ---------------------------------------------------------------------------
  // Supabase Session Refresh (required by @supabase/ssr)
  // Without this, auth tokens expire silently and users get 401s.
  // ---------------------------------------------------------------------------
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({
            request,
          })
          response.headers.set('x-nonce', nonce)
          response.headers.set('Content-Security-Policy', csp)
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // ---------------------------------------------------------------------------
  // Route Protection
  // ---------------------------------------------------------------------------

  const isPublicRoute = PUBLIC_ROUTES.has(pathname) || pathname.startsWith('/auth/')
  const isApiRoute = pathname.startsWith('/api/')
  const isAdminRoute = pathname.startsWith('/admin')

  // Unauthenticated user tries to access protected route → redirect to login
  if (!user && !isPublicRoute && !isApiRoute) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Authenticated user tries to access login/register → redirect to dashboard
  if (user && (pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(new URL('/belege', request.url))
  }

  // Admin routes: check is handled in the admin layout/API routes via service role
  // Middleware only ensures a session exists; role check happens server-side.
  if (isAdminRoute && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
