'use client'

import * as Icons from 'lucide-react'
import type { LucideProps } from 'lucide-react'

type IconName = keyof typeof Icons

interface LucideIconProps extends Omit<LucideProps, 'ref'> {
  name: string
}

/**
 * Renders a Lucide icon by string name. Falls back to HelpCircle if unknown.
 * Used for admin-configurable topic icons in the Hilfe-Center.
 */
export function LucideIcon({ name, ...props }: LucideIconProps) {
  const IconComponent = (Icons as unknown as Record<string, React.ComponentType<LucideProps>>)[
    name
  ]
  const Fallback = Icons.HelpCircle
  const Component = IconComponent ?? Fallback
  return <Component {...props} />
}
