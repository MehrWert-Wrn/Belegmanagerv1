'use client'

import { useState } from 'react'
import { Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'

const MEETING_URL = 'https://cal.meetergo.com/pkindlmayr/15-min-meeting-onboarding-belegerfassung'

export function TeamBanner() {
  const [imgError, setImgError] = useState(false)

  return (
    <div className="w-full overflow-hidden rounded-xl border border-teal-100 bg-white shadow-sm">
      <div className="flex flex-col sm:flex-row">
        {/* Teambild – kompakte Seite */}
        <div className="relative shrink-0 bg-teal-50 sm:w-56 md:w-64">
          {!imgError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/team/mehrwert-team.jpg"
              alt="Das Team der Mehr.Wert Gruppe GmbH"
              className="h-40 w-full object-cover object-center sm:h-full"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="flex h-40 w-full items-center justify-center bg-teal-50 sm:h-full">
              <span className="text-4xl font-bold text-teal-200">M+</span>
            </div>
          )}
        </div>

        {/* Text + CTA */}
        <div className="flex flex-1 flex-col justify-center gap-4 px-6 py-6">
          <div>
            <h2 className="text-lg font-semibold text-[#08525E]">Du bist in guten Händen</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Unser Team kümmert sich persönlich um dein Anliegen.
              Buche dir jetzt ein kostenloses 15-Minuten-Meeting für deinen Einstieg.
            </p>
          </div>
          <div>
            <Button
              className="bg-teal-600 hover:bg-teal-700"
              asChild
            >
              <a href={MEETING_URL} target="_blank" rel="noopener noreferrer">
                <Calendar className="mr-2 h-4 w-4" />
                15-Min-Meeting buchen
              </a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
