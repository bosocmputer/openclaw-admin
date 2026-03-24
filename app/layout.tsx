import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import Sidebar from '@/components/sidebar'
import QueryProvider from '@/components/query-provider'
import { Toaster } from '@/components/ui/sonner'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'OpenClaw Admin',
  description: 'Admin panel for OpenClaw ERP Chatbot',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={geist.className}>
      <body className="h-screen flex overflow-hidden bg-white dark:bg-zinc-950">
        <QueryProvider>
          <Sidebar />
          <main className="flex-1 overflow-y-auto p-6 min-w-0">{children}</main>
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  )
}
