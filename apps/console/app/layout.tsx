import type { ReactNode } from 'react'
import { Nav } from './nav'
import './globals.css'

export const metadata = { title: 'Mini Inference Router' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="top">
          <span className="logo">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                d="M7 12h4l5-5m-5 5 5 5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="5" cy="12" r="2.4" fill="currentColor" />
              <circle cx="18" cy="6" r="2.4" fill="currentColor" />
              <circle cx="18" cy="18" r="2.4" fill="currentColor" />
            </svg>
          </span>
          <strong className="brand">Mini Inference Router</strong>
          <Nav />
        </header>
        {children}
      </body>
    </html>
  )
}
