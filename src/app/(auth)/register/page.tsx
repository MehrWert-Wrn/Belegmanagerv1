'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

const REFERRAL_COOKIE = 'bm_referral'

function readReferralCookie(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${REFERRAL_COOKIE}=`))
  return match ? decodeURIComponent(match.split('=')[1]) : null
}

function clearReferralCookie() {
  if (typeof document === 'undefined') return
  document.cookie = `${REFERRAL_COOKIE}=; max-age=0; path=/; SameSite=Lax`
}

const schema = z.object({
  email: z.string().email('Bitte gib eine gültige E-Mail-Adresse ein'),
  password: z.string().min(8, 'Passwort muss mindestens 8 Zeichen lang sein'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwörter stimmen nicht überein',
  path: ['confirmPassword'],
})

type FormData = z.infer<typeof schema>

export default function RegisterPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [referralCode, setReferralCode] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  // Lese Referral-Code aus URL oder Cookie und persistiere in State
  useEffect(() => {
    const fromUrl = searchParams.get('ref')
    const fromCookie = readReferralCookie()
    const code = fromUrl ?? fromCookie
    if (code && /^BM-[A-Z0-9]{6}$/.test(code.toUpperCase())) {
      setReferralCode(code.toUpperCase())
    }
  }, [searchParams])

  async function onSubmit(data: FormData) {
    setError(null)
    setLoading(true)
    const supabase = createClient()

    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      // Avoid user enumeration – treat "already registered" same as success
      if (!error.message.includes('already registered')) {
        setError('Registrierung fehlgeschlagen. Bitte versuche es erneut.')
        setLoading(false)
        return
      }
      // "already registered": redirect to verify page but skip referral attribution (BUG-007)
      router.push(`/verify-email?email=${encodeURIComponent(data.email)}`)
      return
    }

    // Referral-Attribution: nur bei echtem Signup-Erfolg (kein Fehler, BUG-007)
    if (referralCode) {
      try {
        await fetch('/api/referral/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: referralCode,
            referred_email: data.email,
          }),
        })
      } catch (err) {
        // Fehler nicht blockierend – Signup soll trotzdem weiterlaufen
        console.error('[Referral] register-call fehlgeschlagen:', err)
      } finally {
        clearReferralCookie()
      }
    }

    // Redirect to verify-email page with email param so resend button works
    router.push(`/verify-email?email=${encodeURIComponent(data.email)}`)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Konto erstellen</CardTitle>
        <CardDescription>Registriere dich mit deiner E-Mail und einem Passwort</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          {referralCode && (
            <div
              className="flex items-center gap-2 rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-800"
              role="status"
              aria-live="polite"
            >
              <Sparkles className="h-4 w-4 shrink-0 text-teal-600" aria-hidden="true" />
              <span>
                Du wurdest empfohlen! Code:{' '}
                <code className="font-mono font-semibold">{referralCode}</code>
              </span>
            </div>
          )}
          {error && (
            <div className="rounded-md bg-destructive/10 text-destructive text-sm px-3 py-2">
              {error}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">E-Mail</Label>
            <Input
              id="email"
              type="email"
              placeholder="max@beispiel.at"
              autoComplete="email"
              {...register('email')}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Passwort</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="Mindestens 8 Zeichen"
              {...register('password')}
            />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Passwort bestätigen</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              {...register('confirmPassword')}
            />
            {errors.confirmPassword && (
              <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Registrieren...' : 'Konto erstellen'}
          </Button>
          <p className="text-sm text-gray-500 text-center">
            Bereits ein Konto?{' '}
            <Link href="/login" className="text-primary hover:underline font-medium">
              Anmelden
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  )
}
