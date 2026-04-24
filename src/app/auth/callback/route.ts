import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

// Handles Supabase PKCE auth callbacks:
// - Email verification links
// - Password reset links
// - Invite links (type=invite)
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
          // Use admin client to bypass RLS – the new user is not yet in mandant_users
          // (user_id is still NULL), so get_mandant_id() returns NULL and the regular
          // client's RLS UPDATE policy would silently block the update (BUG-001).
          const adminClient = createAdminClient()

          // Find the pending invite record for this email (BUG-006: also read expiry)
          const { data: inviteRecord } = await adminClient
            .from('mandant_users')
            .select('id, einladung_gueltig_bis')
            .eq('email', authUser.email.toLowerCase())
            .is('user_id', null)
            .eq('aktiv', true)
            .maybeSingle()

          if (inviteRecord) {
            // BUG-006: Reject expired invites – sign out and show an error on the login page
            if (
              inviteRecord.einladung_gueltig_bis &&
              new Date(inviteRecord.einladung_gueltig_bis) < new Date()
            ) {
              await supabase.auth.signOut()
              return NextResponse.redirect(`${origin}/login?error=einladung_abgelaufen`)
            }

            // Link the newly-authenticated user to their mandant_users record
            await adminClient
              .from('mandant_users')
              .update({
                user_id: authUser.id,
                einladung_angenommen_am: new Date().toISOString(),
              })
              .eq('id', inviteRecord.id)
          }
        }
      }

      return NextResponse.redirect(`${origin}${redirectTo}`)
    }
  }

  // Code missing or exchange failed → back to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
