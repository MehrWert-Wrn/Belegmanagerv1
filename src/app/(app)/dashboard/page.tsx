import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  async function signOut() {
    'use server'
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/login')
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="text-gray-500 text-sm">Eingeloggt als {user.email}</p>
      <form action={signOut}>
        <button
          type="submit"
          className="text-sm text-gray-500 underline hover:text-gray-700"
        >
          Abmelden
        </button>
      </form>
    </div>
  )
}
