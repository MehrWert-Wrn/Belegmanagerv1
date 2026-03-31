import Image from 'next/image'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <Image
              src="/logo-icon.svg"
              alt="Belegmanager"
              width={56}
              height={56}
            />
          </div>
          <h1 className="text-2xl font-bold text-[#08525E]">Belegmanager</h1>
          <p className="text-sm text-[#1D8A9E] mt-0.5">by Mehr.Wert Gruppe GmbH</p>
          <p className="text-sm text-gray-500 mt-1">Buchhaltungsvorbereitung für KMUs</p>
        </div>
        {children}
      </div>
    </div>
  )
}
