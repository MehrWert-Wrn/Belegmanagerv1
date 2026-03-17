export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary mb-4">
            <span className="text-primary-foreground font-bold text-xl">B</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Belegmanager</h1>
          <p className="text-sm text-gray-500 mt-1">Buchhaltungsvorbereitung für KMUs</p>
        </div>
        {children}
      </div>
    </div>
  )
}
