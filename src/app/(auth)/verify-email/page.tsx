'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const email = searchParams.get('email')
  const [resent, setResent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function resendVerification() {
    if (!email) return
    setLoading(true)
    const supabase = createClient()

    await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    setResent(true)
    setLoading(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>E-Mail bestätigen</CardTitle>
        <CardDescription>Bitte bestätige deine E-Mail-Adresse</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-gray-600">
          Wir haben dir einen Bestätigungslink geschickt
          {email && <> an <span className="font-medium">{email}</span></>}.
          Bitte klicke auf den Link in der E-Mail.
        </p>
        {resent && (
          <div className="rounded-md bg-accent text-accent-foreground text-sm px-3 py-2">
            Bestätigungslink wurde erneut gesendet.
          </div>
        )}
        <p className="text-sm text-gray-500">
          Keine E-Mail erhalten? Prüfe deinen Spam-Ordner oder fordere einen neuen Link an.
        </p>
      </CardContent>
      <CardFooter className="flex flex-col gap-3">
        {email && (
          <Button
            variant="outline"
            className="w-full"
            onClick={resendVerification}
            disabled={loading || resent}
          >
            {loading ? 'Senden...' : resent ? 'Link gesendet' : 'Link erneut senden'}
          </Button>
        )}
        <Link href="/login" className="text-sm text-gray-500 hover:text-gray-700">
          Zurück zur Anmeldung
        </Link>
      </CardFooter>
    </Card>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="h-64 rounded-lg bg-white animate-pulse" />}>
      <VerifyEmailContent />
    </Suspense>
  )
}
