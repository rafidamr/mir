'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/', label: 'Chat' },
  { href: '/usage', label: 'Usage' },
]

/** The page tabs, with the current page highlighted. */
export function Nav() {
  const path = usePathname()
  return (
    <nav className="tabs">
      {TABS.map((tab) => (
        <Link key={tab.href} href={tab.href} className={path === tab.href ? 'tab active' : 'tab'}>
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
