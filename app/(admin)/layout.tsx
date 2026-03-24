import Sidebar from '@/components/sidebar'
import QueryProvider from '@/components/query-provider'
import { Toaster } from '@/components/ui/sonner'
import { getSession } from '@/lib/session'
import { redirect } from 'next/navigation'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')

  return (
    <div className="h-screen flex overflow-hidden">
      <QueryProvider>
        <Sidebar role={session.role} username={session.username} displayName={session.displayName} />
        <main className="flex-1 overflow-y-auto p-6 min-w-0">{children}</main>
        <Toaster />
      </QueryProvider>
    </div>
  )
}
