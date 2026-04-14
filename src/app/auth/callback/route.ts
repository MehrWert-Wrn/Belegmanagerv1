import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

// Handles Supabase PKCE auth callbacks:
// - Email verification links
// - Password reset links
// - OAuth redirects (future)
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  // Only allow relative redirects to prevent open redirect
  const redirectTo = next.startsWith('/') ? next : '/dashboard'

  if (code) {
    const cookieStore = await cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const type = searchParams.get('type')

      // Password reset: send user to the reset-password page so they can set a new password
      if (type === 'recovery') {
        return NextResponse.redirect(`${origin}/reset-password`)
      }

      // Link invited user to their mandant_users record
      if (type === 'invite') {
        const { data: { user: authUser } } = await supabase.auth.getUser()
        if (authUser?.email) {
          await supabase
            .from('mandant_users')
            .update({
              user_id: authUser.id,
              einladung_angenommen_am: new Date().toISOString(),
            })
            .eq('email', authUser.email.toLowerCase())
            .is('user_id', null)
            .eq('aktiv', true)
        }
      }
      return NextResponse.redirect(`${origin}${redirectTo}`)
    }
  }

  // Code missing or exchange failed → back to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
