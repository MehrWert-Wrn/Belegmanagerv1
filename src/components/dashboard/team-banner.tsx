'use client'

import { useState } from 'react'
import { Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'

const MEETING_URL = 'https://cal.meetergo.com/pkindlmayr/15-min-meeting-onboarding-belegerfassung'

export function TeamBanner() {
  const [imgError, setImgError] = useState(false)

  return (
    <div className="w-full overflow-hidden rounded-xl border border-teal-100 bg-white shadow-sm">
      {/* Teambild – volle Breite */}
      <div className="relative w-full bg-teal-50">
        {!imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/team/mehrwert-team.jpg"
            alt="Das Team der Mehr.Wert Gruppe GmbH"
            className="h-48 w-full object-cover object-top sm:h-64 md:h-72"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-48 w-full items-center justify-center bg-teal-50 sm:h-64">
            <span className="text-5xl font-bold text-teal-200">M+</span>
          </div>
        )}
        {/* Gradient-Overlay unten für weichen Übergang */}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent" />
      </div>

      {/* Text + CTA */}
      <div className="flex flex-col items-center gap-3 px-6 pb-6 pt-2 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
        <div>
          <h2 className="text-lg font-semibold text-[#08525E]">Du bist in guten Händen</h2>
          <p className="text-sm text-muted-foreground">
            Unser Team kümmert sich persönlich um dein Anliegen.
          </p>
        </div>
        <Button
          className="shrink-0 bg-teal-600 hover:bg-teal-700"
          asChild
        >
          <a href={MEETING_URL} target="_blank" rel="noopener noreferrer">
            <Calendar className="mr-2 h-4 w-4" />
            15-Min-Meeting buchen
          </a>
        </Button>
      </div>
    </div>
  )
}
