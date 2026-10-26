import Link from 'next/link'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata = { title: 'Mini Inference Router' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header>
          <strong>Mini Inference Router</strong>
          <nav>
            <Link href="/">Chat</Link>
            <Link href="/usage">Usage</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  )
}
