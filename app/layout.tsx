import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'OpenClaw Admin',
  description: 'Admin panel for OpenClaw ERP Chatbot',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={geist.className}>
      <body className="bg-white dark:bg-zinc-950">
        {children}
      </body>
    </html>
  )
}
