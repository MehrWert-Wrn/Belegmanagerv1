'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  FileText,
  ArrowLeftRight,
  BookOpen,
  CalendarCheck,
  Settings,
  LogOut,
  HelpCircle,
  Gift,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { TrialBanner } from '@/components/billing/trial-banner'
import type { BillingStatus } from '@/lib/billing'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'

const navItems = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { title: 'Belege', href: '/belege', icon: FileText },
  { title: 'Transaktionen', href: '/transaktionen', icon: ArrowLeftRight },
  { title: 'Kassabuch', href: '/kassabuch', icon: BookOpen },
  { title: 'Monatsabschluss', href: '/monatsabschluss', icon: CalendarCheck },
  { title: 'Empfehlen & Sparen', href: '/referral', icon: Gift },
  { title: 'Einstellungen', href: '/settings/firma', icon: Settings },
  { title: 'Hilfe-Center', href: '/help', icon: HelpCircle },
]

interface AppSidebarProps {
  userEmail: string
  children: React.ReactNode
  billingStatus?: BillingStatus | null
}

export function AppSidebar({ userEmail, children, billingStatus }: AppSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const initials = userEmail
    .split('@')[0]
    .slice(0, 2)
    .toUpperCase()

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="p-4">
          <div className="flex items-center gap-2">
            <Link href="/dashboard" className="flex items-center gap-3 flex-1 min-w-0">
              <Image
                src="/logo-icon.svg"
                alt="Belegmanager Logo"
                width={32}
                height={32}
                className="shrink-0"
              />
              <div className="flex flex-col leading-tight group-data-[state=collapsed]:hidden">
                <span className="text-sm font-semibold text-[#08525E]">Belegmanager</span>
                <span className="text-[10px] text-[#1D8A9E]">by Mehr.Wert Gruppe GmbH</span>
              </div>
            </Link>
            <SidebarTrigger className="hidden md:flex shrink-0 -mr-1" />
          </div>
        </SidebarHeader>

        <SidebarSeparator />

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => {
                  const isActive = pathname.startsWith(item.href)
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.title}
                      >
                        <Link href={item.href}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          {billingStatus && <TrialBanner billing={billingStatus} />}
          <SidebarSeparator />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 px-2"
              >
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="bg-teal-100 text-teal-700 text-xs">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate text-sm group-data-[state=collapsed]:hidden">{userEmail}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Abmelden
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b px-4 md:hidden">
          <SidebarTrigger />
          <Image
            src="/logo-icon.svg"
            alt="Belegmanager Logo"
            width={28}
            height={28}
            className="shrink-0"
          />
          <span className="font-semibold text-[#08525E]">Belegmanager</span>
        </header>
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
