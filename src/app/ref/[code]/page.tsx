import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { cookies } from 'next/headers'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  CheckCircle2,
  Sparkles,
  Clock,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react'

// Verhindert Caching, damit der Cookie immer frisch gesetzt wird
export const dynamic = 'force-dynamic'

// SEO: Landing Page nicht indexieren – verhindert Code-Scraping
export const metadata: Metadata = {
  title: 'Belegmanager – auf Empfehlung kostenlos testen',
  description:
    'Belegmanager ist die Buchhaltungsvorbereitung für österreichische KMUs. Du wurdest empfohlen – jetzt kostenlos testen.',
  robots: {
    index: false,
    follow: false,
  },
}

const COOKIE_NAME = 'bm_referral'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7 // 7 Tage

interface PageProps {
  params: Promise<{ code: string }>
}

export default async function ReferralLandingPage({ params }: PageProps) {
  const { code: rawCode } = await params
  const code = decodeURIComponent(rawCode).toUpperCase().trim()

  // Code-Format validieren: BM-XXXXXX
  const codeFormatValid = /^BM-[A-Z0-9]{6}$/.test(code)

  let validCode = false
  let referralCodeId: string | null = null

  if (codeFormatValid) {
    try {
      const admin = createAdminClient()
      const { data } = await admin
        .from('referral_codes')
        .select('id, code')
        .eq('code', code)
        .maybeSingle()

      if (data) {
        validCode = true
        referralCodeId = data.id
      }
    } catch (err) {
      console.error('[/ref/[code]] DB-Fehler beim Code-Lookup:', err)
    }
  }

  // Bei ungültigem Code: Stille Weiterleitung zu /register ohne Referral
  if (!validCode) {
    redirect('/register')
  }

  // Cookie setzen + Click tracken
  const cookieStore = await cookies()
  const headersList = await headers()
  const referer = headersList.get('referer') ?? ''
  const userAgent = headersList.get('user-agent') ?? ''

  // Nur setzen, wenn nicht bereits vorhanden (Rate-Limit pro Session)
  const existingCookie = cookieStore.get(COOKIE_NAME)?.value
  if (existingCookie !== code) {
    cookieStore.set(COOKIE_NAME, code, {
      maxAge: COOKIE_MAX_AGE,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      httpOnly: false, // Muss vom Client lesbar sein
      path: '/',
    })

    // Click in DB tracken (nur bei neuem Cookie, nicht bei Refresh)
    try {
      const admin = createAdminClient()

      // 1. total_clicks erhöhen
      await admin.rpc('increment_referral_clicks', { p_code: code }).then(
        (res) => {
          // Falls RPC nicht existiert, fallback auf direktes Update
          if (res.error) {
            return admin
              .from('referral_codes')
              .update({ total_clicks: 1 })
              .eq('id', referralCodeId!)
          }
        },
      )

      // 2. Referral-Eintrag mit Status 'clicked' anlegen
      await admin.from('referrals').insert({
        referral_code_id: referralCodeId,
        status: 'clicked',
        clicked_at: new Date().toISOString(),
        // Optional: User-Agent / Referer als Metadaten
      })
    } catch (err) {
      console.error('[/ref/[code]] Click-Tracking fehlgeschlagen:', err)
      // Nicht blockieren – Landing Page muss laden
    }
  }

  const features = [
    'Automatisches Matching von Zahlungen mit Belegen',
    'CSV-Import für Kontoauszug & Kassabuch',
    'Monatsabschluss in unter 30 Minuten',
    'DATEV-kompatibler Export für deinen Steuerberater',
    'DSGVO-konform – Server in der EU',
  ]

  // Suppress unused vars (für künftige Telemetrie)
  void referer
  void userAgent

  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-50 via-white to-white">
      {/* Header */}
      <header className="border-b border-teal-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/logo-icon.svg"
              alt="Belegmanager Logo"
              width={32}
              height={32}
            />
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-[#08525E]">Belegmanager</span>
              <span className="text-[10px] text-[#1D8A9E]">by Mehr.Wert Gruppe GmbH</span>
            </div>
          </Link>
          <Button asChild variant="ghost" size="sm" className="text-teal-700 hover:bg-teal-50">
            <Link href="/login">Anmelden</Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 py-12 md:py-20">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          {/* Left: Pitch */}
          <div className="flex flex-col gap-6">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Du wurdest empfohlen
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-[#08525E] md:text-4xl lg:text-5xl">
              Buchhaltungsvorbereitung, die sich
              <span className="block text-teal-600">selbst erledigt.</span>
            </h1>

            <p className="text-base text-muted-foreground md:text-lg">
              Belegmanager matcht deine Zahlungsausgänge automatisch mit den passenden
              Belegen – mit Ampel-Status, Monatsabschluss und Steuerberater-Export.
              Speziell für österreichische KMUs gebaut.
            </p>

            <ul className="flex flex-col gap-2.5">
              {features.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5 text-sm">
                  <CheckCircle2
                    className="mt-0.5 h-4 w-4 shrink-0 text-teal-600"
                    aria-hidden="true"
                  />
                  <span className="text-foreground">{feature}</span>
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="bg-teal-600 text-base hover:bg-teal-700"
              >
                <Link href={`/register?ref=${encodeURIComponent(code)}`}>
                  Jetzt kostenlos testen
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-teal-300 text-teal-700 hover:bg-teal-50"
              >
                <Link href="/login">Bereits Kunde? Anmelden</Link>
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-teal-600" />
                DSGVO &amp; AT-Datenschutz
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-teal-600" />
                In 10 Min. eingerichtet
              </span>
            </div>
          </div>

          {/* Right: Visual / Vorteils-Karte */}
          <div className="relative">
            <Card className="border-teal-200 bg-white shadow-lg">
              <CardHeader>
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-teal-100">
                  <Sparkles className="h-7 w-7 text-teal-700" aria-hidden="true" />
                </div>
                <CardTitle className="text-center text-xl text-[#08525E]">
                  Das erwartet dich
                </CardTitle>
                <CardDescription className="text-center">
                  Volle Funktionalität – ohne Kreditkarte starten
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-teal-100 bg-teal-50/50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-teal-700">
                    Matching-Quote
                  </p>
                  <p className="mt-1 text-3xl font-bold text-[#08525E]">≥ 80 %</p>
                  <p className="text-xs text-muted-foreground">
                    automatisch, ohne manuelle Zuordnung
                  </p>
                </div>
                <div className="rounded-lg border border-teal-100 bg-teal-50/50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-teal-700">
                    Monatsabschluss
                  </p>
                  <p className="mt-1 text-3xl font-bold text-[#08525E]">&lt; 30 Min.</p>
                  <p className="text-xs text-muted-foreground">
                    statt 2–4 Stunden manueller Arbeit
                  </p>
                </div>
                <div className="rounded-lg border border-teal-100 bg-teal-50/50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-teal-700">
                    Steuerberater-Export
                  </p>
                  <p className="mt-1 text-base font-semibold text-[#08525E]">
                    BMD · RZL · Sage
                  </p>
                  <p className="text-xs text-muted-foreground">
                    ZIP mit CSV + Belege-PDFs
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer Banner: Code Info */}
      <section className="border-t border-teal-100 bg-teal-50/60 py-6">
        <div className="mx-auto max-w-6xl px-4 text-center">
          <p className="text-xs text-muted-foreground">
            Empfehlungs-Code:{' '}
            <code className="rounded bg-white px-2 py-0.5 font-mono text-teal-700">
              {code}
            </code>
            {' · '}
            Wird beim Signup automatisch berücksichtigt
          </p>
        </div>
      </section>
    </div>
  )
}
